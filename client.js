
var app 		= require('express')();
var http 		= require('http').createServer(app);
var io 			= require('socket.io-client');
var basicAuth 	= require('express-basic-auth')

var formidable 	  = require('formidable');
var fs 			  = require('fs');
var glob 		  = require('glob');
var Tail   		  = require('tail').Tail;
var moment		  = require('moment');
var wget  		  = require('node-wget');
var config 		  = require('./config');
var exec  		  = require('child_process').exec;
var xmldom 		  = require('xmldom').DOMParser;
var XMLSerializer = require('xmldom').XMLSerializer;
var serializer    = new XMLSerializer();
var ps 			  = require('ps-node');
var nodemailer 	  = require('nodemailer');
var nl2br 	  	  = require('nl2br');

var transporter = nodemailer.createTransport({
    host: 'partner1.crosshost.com.br',
    port: 465,
    secure: true,
    auth: {
        user: 'teste@videochat.crosshost.com.br',
        pass: 'cross2017'
    }
});

var argv = require('minimist')(process.argv.slice(2));

var webfolder    = argv.w ? argv.w : config.defaultWebfolder;
var configfolder = argv.c ? argv.c : config.defaultConfigfolder;
var logfolder	 = argv.l ? argv.l : config.defaulLogfolder;

app.use(basicAuth({
    users: { 'cross': 'host321' },
    challenge: true,
    unauthorizedResponse: getUnauthorizedResponse
}));

function getUnauthorizedResponse(req) {
    return req.auth ?
        ('Credentials ' + req.auth.user + ':' + req.auth.password + ' rejected') :
        'No credentials provided'
}

app.post("/upload", function(req, res){
	var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
		var oldpath = files.vinheta.path;
		var newpath = fields.destination;

		child = exec('cp '+oldpath+' '+newpath, function (error, stdout, stderr) {
	            console.log('stdout: ' + stdout);
	            console.log('stderr: ' + stderr);
	            if (error !== null) {
	               console.log('exec error: ' + error);

	            	writeRes(res, {success: true, error: error, stdout: stdout, stderr: stderr});
	            	return;
	            }

		fs.stat(newpath, function(errt, statt){
			
			console.log(statt);
		});
	            writeRes(res, {success: true, file: newpath});
				//fs.chmodSync(newpath, '777');
	    });
	});
});

tails = [];

app.get("/check", function(req, res){
	console.log('check');
	writeRes(res, {success: true});
});

app.get("/listTails", function(req, res){
	ress = [];
	for(var i in tails){
		ress.push(i);
	}
	writeRes(res, ress);
});

http.listen(7001, function () {
  console.log('listening on *:7001');
});

var socket = io.connect('http://'+config.serverUrl+':7000', {reconnect: true});

// Add a connect listener
socket.on('connect', function (socket) {
    console.log('Connected!');
    sendToServer('whoiam', config.hostname);
});


socket.on('update', function (res) {
	console.log('my updating');

	child = exec('git pull origin master', {cwd: __dirname},  function (error, stdout, stderr) {
		child = exec('git rev-parse --short HEAD', {cwd: __dirname},  function (error, stdout, stderr) {
	       sendToServer('updateOk', {hostname: config.hostname, hash: stdout});

	       child = exec('/bin/bash -c "ulimit -n 50480; exec /usr/bin/forever restart '+__dirname+'/client.js"', {cwd: __dirname}, function (error, stdout, stderr){
	       		console.log(error, stdout, stderr)
	       });
	    });
	});
});

socket.on('setupcc', function (res) {
	console.log(res);
	var port = res.stream.url_stream.split(':');
	port = port[port.length-1];
	console.log(res.stream.pathweb+port+".audio");
	fs.stat(res.stream.pathweb+port+".audio", function(err, stat){
		//if(err){
			console.log('settuping cc');

			fs.writeFile(res.stream.pathweb+port+".audio", res.audio, function(err) {
			    console.log('created '+res.stream.pathweb+port+".audio");

				monitoring(res.stream, port);
			});
		// }else{
		// 	console.log('already setuped');
		// }
	});
});
var monitors = [];

function monitoring(stream, port){
	monitors[port] = setInterval(function(){
		console.log('monitoring '+port);
		fs.stat('changed-configfile-'+port+'.txt', function(errt, statt){
			if(!errt){
				var changed = fs.readFileSync('changed-configfile-'+port+'.txt');
				changed = changed.toString();
				console.log(changed);
			}else{
				changed = 0;
			}

			mod = false;

			if(filechanged = fs.statSync(stream.configfile).mtime.getTime()){
				console.log(Math.floor(filechanged/1000), Number(changed));
				if(Math.floor(filechanged/1000) > Number(changed)){
					console.log('foi modficado');
					mod = true;
				}else{
					console.log("arquivo atualizado");
				}
			}

			if(mod){
				doc = new xmldom().parseFromString(fs.readFileSync(stream.configfile).toString(), 'application/xml');
				mount = doc.getElementsByTagName('mount');
				mountname = mount[0].getElementsByTagName('mount-name');

				if(mountname){
					mount[0].removeChild(mountname);
				}
				audio = mount[0].getElementsByTagName('intro');
				if(audio.length>0){
					audio[0].text = port+".audio";
					audio[0].nodeValue = port+".audio";
				}else{
					newEle = doc.createElement("intro");
					newText = doc.createTextNode(port+".audio");
					newEle.appendChild(newText);
					mount[0].appendChild(newEle);
				}
				mount[0].setAttribute('type', 'default');

				security = doc.getElementsByTagName('security');
				icecast = doc.getElementsByTagName('icecast');
				
				if(security.length==0){
					newSec = doc.createElement("security");
					newCh = doc.createElement("chroot");
					newChangeowner = doc.createElement("changeowner");
					newCOuser = doc.createElement("user");
					newCOgroup = doc.createElement("group");
					newChText = doc.createTextNode("0");
					newCOuserText = doc.createTextNode("mediacp");
					newCOgroupText = doc.createTextNode("mediacp");
					newCOuser.appendChild(newCOuserText);
					newCh.appendChild(newChText);
					newCOgroup.appendChild(newCOgroupText);
					newSec.appendChild(newCh);
					newSec.appendChild(newChangeowner);
					newChangeowner.appendChild(newCOuser);
					newChangeowner.appendChild(newCOgroup);
					icecast[0].appendChild(newSec);
				}
				
				console.info('new node', mount[0].firstChild.nodeValue);
				console.info('doc after change', serializer.serializeToString(doc));

				fs.writeFile(
				  stream.configfile, 
				  serializer.serializeToString(doc), 
				  function(error) {
				    if (error) {
				      console.log(error);
				    } else {
				      console.log("The file was saved!");
				      fs.writeFileSync('changed-configfile-'+port+'.txt', moment().unix());
				      fs.writeFile(stream.pathweb+'cron-configfile.txt', stream.configfile, function(err){
				      	if(err){
				      		console.log('error to create ', stream.pathweb+'cron-configfile.txt');
				      	}else{
				      		console.log('created ', stream.pathweb+'cron-configfile.txt');
				      	}
				      });
				    }
				  }
				); 

				ps.lookup({
				    command: 'icecast',
				    psargs: '-aux',
				    arguments: stream.configfile
				    }, function(err, resultList ) {
				    if (err) {
				        throw new Error( err );
				    }
				    resultList.forEach(function( process ){
				        if( process ){
				            console.log( 'PID: %s', process.pid );
				            ps.kill( process.pid, function( err ) {
							    if (err) {
							        throw new Error( err );
							    }
							    else {
							        console.log('create file for crontab');
							    }
							});
				        }
				    });
				});
	 		}
	
			
			
		});
	}, 5000);
	console.log('start monitoring '+port);
}

socket.on('logs', function (data) {
    console.log('get log!', data);
    console.log('tails', tails.length);		
    (function(dataDb){
			fs.stat(dataDb.filename, function(err, stat){
				if(err == null){
					if(typeof tails[dataDb.filename] != 'undefined'){
						tails[dataDb.filename].unwatch();
						delete tails[dataDb.filename];
					}
					tails[dataDb.filename] = new Tail(dataDb.filename);
					console.log('tail :', dataDb.filename, dataDb.mountpoint);
					tails[dataDb.filename].on('line', function(data){
						console.log(dataDb.type);

						if(dataDb.type=='shoutcast'){
							match = data.match(/^([.0-9]+) ([.0-9]+) ([0-9-]+\s[0-9:]+) (.*?) ([0-9]+) (.*?) ([0-9]+) ([0-9]+) ([0-9]+)/);
						}else{
							match = data.match(/^(\S+) \S+ \S+ \[(.*?)\] "(.+).*?" \d+ \d+ "(.*?)" "(.*?)" ([0-9]+)/);
						}

						if (match){
							info = [];
							
							if(match[3].indexOf(dataDb.mountpoint) != -1 || dataDb.type=='shoutcast'){
								if(match[3].indexOf('SOURCE') != -1){
									return;
								}

								info.ip		= match[1];
								if( dataDb.type=='shoutcast'){
									info["date"] 	= moment(match[3]).subtract(match[8], 'seconds').format('YYYY-MM-DD HH:mm:ss')
									info["method"]	= '/GET';
									info["referer"] = match[4];
									info["browser"]	= match[6];
									info["time"] 	= match[8];
								}else{
									info["date"] 	= isoDate(match[2], match[6]);
									info["method"]	= match[3];
									info["referer"] = match[4];
									info["browser"]	= match[5];
									info["time"] 	= match[6];
								}
								

								if(info["time"] <= 10){
									return;
								}

								info["ip"] = info["ip"] == '127.0.0.1' ? '189.78.174.121' : info.ip;

								var res = {
									id: 	  dataDb.id, 
									ip: 	  info["ip"],
									date: 	  info["date"],
									time:     info["time"],
									referer:  info["referer"],
									browser:  info["browser"]
								};
								console.log('info', res);

								sendToServer('dataLog', res);

								
							}
						}				
					});
				}
			});
		})(data);
});

sendToServer = function(action, data){
	socket.emit(action, data);
}


isoDate = function(date, sub) {
    if (!date) {
        return null
    }
    date = moment(date, 'DD/MMM/YYYY:HH:mm:ss Z');
    return date.subtract(sub, 'seconds').format('YYYY-MM-DD HH:mm:ss');
}

writeRes = function(res, data){
	res.writeHead(200, {'Content-Type': 'application/json'});
	console.log('returned ', JSON.stringify(data));
	res.write(JSON.stringify(data));
	res.end();
}


process.on('uncaughtException', function(err) {
  console.log('Caught exception: ' + err.stack);
  console.log("tails.length: ", tails.length);

  sendMailLog(err.stack);
});

function sendMailLog(err){
	var mailOptions = {
	    from: '"Logger 👻" <log@crosshost.com.br>', 
	    to: 'thiago.h4c@gmail.com', 
	    subject: 'Error on ['+config.hostname+']', 
	    text: 'Server: '+config.hostname+'<br>Date: '+moment().format("YYYY-MM-DD HH:mm:ss")+'<br> <br><br>Caught exception: ' + nl2br(err) + '', 
	    html: 'Server: '+config.hostname+'<br>Date: '+moment().format("YYYY-MM-DD HH:mm:ss")+'<br> <br><br>Caught exception: ' + nl2br(err)
	};

	transporter.sendMail(mailOptions, (error, info) => {
	    if (error) {
	        return console.log(error);
	    }
	    console.log('Message %s sent: %s', info.messageId, info.response);
	});
}

