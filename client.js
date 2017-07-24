
var app 		= require('express')();
var http 		= require('http').createServer(app);
var io 			= require('socket.io-client');
var basicAuth 	= require('express-basic-auth')

var formidable 	= require('formidable');
var fs 			= require('fs');
var glob 		= require('glob');
var Tail   		= require('tail').Tail;
var moment		= require('moment');
var wget  		= require('node-wget');
var config 		= require('./config');

var argv = require('minimist')(process.argv.slice(2));

var webfolder    = argv.w ? argv.w : config.defaultWebfolder;
var configfolder = argv.c ? argv.c : config.defaultConfigfolder;
var logfolder	 = argv.l ? argv.l : config.defaulLogfolder;

app.use(basicAuth({
    users: { 'cross': 'host321' },
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
		fs.rename(oldpath, newpath, function (err) {
		if (err) throw err;
			writeRes(res, {success: true, file: newpath});
			fs.chmodSync(newpath, '777');
		});
	});
});

app.get("/check", function(req, res){
	console.log('check');
	writeRes(res, {success: true});
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

tails = [];

socket.on('logs', function (data) {
    console.log('get log!', data);
    (function(dataDb){
			fs.stat(dataDb.filename, function(err, stat){
				if(err == null){
					tails[dataDb.filename] = new Tail(dataDb.filename);
					console.log('tail :', dataDb.filename, dataDb.mountpoint);
					tails[dataDb.filename].on('line', function(data){
						match = data.match(/^(\S+) \S+ \S+ \[(.*?)\] "(.+).*?" \d+ \d+ "(.*?)" "(.*?)" ([0-9]+)/);
						if (match){
							info = [];
							if(match[3].indexOf(dataDb.mountpoint) != -1){

								info.ip		= match[1];
								info["date"] 	= isoDate(match[2]);
								info["method"]	= match[3];
								info["referer"] = match[4];
								info["browser"]	= match[5];
								info["time"] 	= match[6];

								if(info["time"] == 0){
									return;
								}

								info["ip"] = info["ip"] == '127.0.0.1' ? '189.78.174.121' : info.ip;

								wget({
										url:  'http://preroll.crosshost.com.br/api/lookup-ip?ip='+info["ip"],
										dest: '/tmp/'
									}, function(error, response, body){
									var result = JSON.parse(body);

									var res = {
										id: 	  dataDb.id, 
										ip: 	  info["ip"],
										date: 	  info["date"],
										time:     info["time"],
										referer:  info["referer"],
										resultIP: result
									};
									console.log('info', res);

									sendToServer('dataLog', res);
								});
							}else{
								console.log(dataDb, ' not valid', match[3]);
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


isoDate = function(date) {
    if (!date) {
        return null
    }
    date = moment(date, 'DD/MMM/YYYY:HH:mm:ss Z');
    return  date.format('YYYY-MM-DD HH:mm:ss');
}

writeRes = function(res, data){
	res.writeHead(200, {'Content-Type': 'application/json'});
	console.log('returned ', JSON.stringify(data));
	res.write(JSON.stringify(data));
	res.end();
}