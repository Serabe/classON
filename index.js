var http = require('http');
var path = require('path');
var fs = require('fs');
var express = require('express');
var EventManager = require('./eventmanager').EventManager;

var app = express.createServer();
//Websockets
var io = require('socket.io').listen(app);
io.set('log level', 1);

var eventManager = new EventManager('localhost', 27017);

app.configure(function(){
    app.use(express.methodOverride());
    app.use(express.bodyParser());
    app.use(app.router);
});

var serve_http = function(request, response){
console.log('requester IP:'+request.connection.remoteAddress);
console.log('requesting file:'+request.url);


	var filePath = '.' + request.url;
	if(filePath.indexOf('?')!=-1) filePath = filePath.substr(0,filePath.indexOf('?'));
	if (filePath.substr(-1)==('/')) filePath += 'index.html';
	
	
    var extname = path.extname(filePath);
    var contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.gif':
            contentType = 'imge/gif';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.ico':
        	contentType = 'image/x-icon';
        	break;
    }
    
    path.exists(filePath, function(exists) {
    	if (exists) {
            fs.readFile(filePath, function(error, content) {
                if (error) {
                    response.writeHead(500);
                    response.end();
                }  else {
                    response.writeHead(200, { 'Content-Type': contentType });
                    response.end(content, 'utf-8');
                }
            });
        } else {
            response.writeHead(404);
            response.end();
        }
    });
};

app.get('/student/*', function (request, response) {
	serve_http(request, response);
});

app.get('/teacher/*', function (request, response) {
	serve_http(request, response);
});

app.get('/users/photos/*', function (request, response) {
	serve_http(request, response);
});


//TODO: hacer din�mico!
//Sessions: list of objects
/*	session_item = { 
		username: "username",
		exercise: 0,
		help: false,
		IP: "IP"
	}
	queue_item = IPs
 */
var sessions = {};
var queues = {};

function getSession(id){
	if(sessions[id]==undefined) sessions[id] = [];
	return sessions[id];
}

function getQueue(id){
	if(queues[id]==undefined) queues[id] = [];
	return queues[id];
}

/*
var session_66 = [];
var session_67 = [];

//Queue of students waiting for help. List of IPs
var queue_66 = [];
var queue_67 = [];

var students_66 = [];
var students_67 = [];

getUserByParam({group: "66"}, function(err, docs){
	for (var i=0; i<docs.length; i++){
		students_66.push(docs[i].username);
	}
});

getUserByParam({group: "67"}, function(err, docs){
	for (var i=0; i<docs.length; i++){
		students_67.push(docs[i].username);
	}
});
*/

function getUserByParam(userParams, handler){
	var mongodb = require('mongodb');
	var server = new mongodb.Server("127.0.0.1", 27017, {});
	new mongodb.Db('classon', server, {}).open(function (error, client) {
		  if (error) throw error;
		  var collection = new mongodb.Collection(client, 'users');
		  collection.find(userParams).toArray(function(err, docs) {
			  handler(err, docs);
			  client.close();
		  });
	});
}

function getUsersByUsername(usernameArray, userInfoArray, handler){
	if(usernameArray.length>0){
		var username = usernameArray.pop();
		getUserByParam({username: username}, function(error, userInfo){
			if(!error && userInfo.length>0){
				userInfoArray.push(userInfo[0]);
				getUsersByUsername(usernameArray, userInfoArray, handler);
			}else{
				handler("error");
			}
		});
	}else{
		handler(null, userInfoArray);
	}
}

io.sockets.on('connection', function (socket) {
	
	//Request user list
	socket.on('userList', function (userParams) {
		//console.log('userList:'+JSON.stringify(userParams));
		getUserByParam(userParams, function(err, docs){
			if(err){
				  console.log('error en la consulta: userList');
				  socket.emit('userListResp', []);
				}else{
					//console.log('docs:'+JSON.stringify(docs));
					socket.emit('userListResp', docs);
				}
		});
	});
	
	//Event from student
	socket.on('new event', function(event){
		eventManager.save(event, function(error, events){
			var event = events[0];
			console.log('new event:'+JSON.stringify(event));
			event.IP = socket.handshake.address.address;
			//Forward event to the teachers + other students
			socket.broadcast.emit('event', event);
			
			var my_session = getSession(event.session);
			var my_queue = getQueue(event.session);
			
			/*
			var my_session = session_66; //Grupo 66
			var my_queue = queue_66;
			if(students_66.indexOf(event.user[0])==-1){//67
				my_session = session_67;
				my_queue = queue_67;
			}
			*/
			//console.log('new event(my_session):'+JSON.stringify(my_session));
			//console.log('new event(my_queue):'+JSON.stringify(my_queue));
			
			//console.log('new event(sessions):'+JSON.stringify(sessions));
			//console.log('new event(queues):'+JSON.stringify(queues));
			
			var students = event.user;
			for(var i=0; i<students.length; i++){
				var found = false;
				for(var j=0; j<my_session.length; j++){
					if(students[i] == my_session[j].username){
						switch(event.eventType){
						case "connection":
							break;
						case "finishSection":
							my_session[j].exercise +=1;
							break;
						case "undoFinishSection":
							my_session[j].exercise -=1;
							break;
						case "help":
							my_session[j].help = true;
							my_session[j].description = event.description;
							my_queue.push(event.IP);
							break;
						case "solved":
							my_session[j].help = false;
							if(my_queue.indexOf(event.IP)!=-1){
								my_queue.splice(my_queue.indexOf(event.IP),1);
							}
							break;
						}
						found = true;
						break;
					}
				}
				if(!found){
					//Not found!
					console.log("not found info about "+students.join(","));
					my_session.push({ 
						username: students[i],
						exercise: 0,
						help: false,
						IP: event.IP
					});
				}
			}
			
			//io.sockets.emit('event', event);
			
		});
	});
	
	
	//Event from teacher
	socket.on('teacher event', function(event){
		if(event.eventType=="endHelp" && event.user){
			var IP = event.IP;
			delete event.IP;
			
			var my_session = getSession(event.session);
			var my_queue = getQueue(event.session);
			//console.log('teacher event before loop'+JSON.stringify(event));
			var students = event.user;
			for(var i=0; i<students.length; i++){
				for(var j=0; j<my_session.length; j++){
					if(students[i] == my_session[j].username){
						//console.log('teacher event found student for'+students[i]);
						my_session[j].help = false;
						if(my_queue.indexOf(IP)!=-1){
							my_queue.splice(my_queue.indexOf(IP),1);
						}
						break;
					}
				}
			}
		}
		eventManager.save(event, function(error, events){
			var event = events[0];
			console.log('teacher event'+JSON.stringify(event));
		});
	});
	
	//New student connected
	socket.on("new student", function(users){
		students = users.user;
		console.log('new student:'+students.join(","));
		
		getUsersByUsername(students.slice(0), [], function(error, userInfoArray){
			if(error){
				console.log('student registered: error emitted');
				socket.emit('student registered',{error:error});
			}else{
				var my_session = getSession(userInfoArray[0].group+users.session);
				//console.log('new student.my_session:'+userInfoArray[0].group+users.session);
				//console.log('new student(my_session):'+JSON.stringify(my_session));
				//console.log('new event(sessions):'+JSON.stringify(sessions));
				//console.log('new event(queues):'+JSON.stringify(queues));
				
				
				console.log('new student:'+students.join(","));
				//console.log('new student(userInfoArray):'+userInfoArray);
				var emited = false;
				for(var i=0; i<students.length; i++){
					var found = false;
					
					for(var j=0; j<my_session.length; j++){
						if(students[i] == my_session[j].username){
							if(!emited){
								//console.log('emit student registered:'+my_session[j].exercise);
								socket.emit('student registered', {
									userInfoArray : userInfoArray,
									exercise: my_session[j].exercise, 
									help: my_session[j].help
									});
								emited = true;
							}
							found = true;
							break;
						}
					}
					if(!found){
						//Not found
						my_session.push({ 
							username: students[i],
							exercise: 0,
							help: false,
							IP: socket.handshake.address.address
						});
						//console.log('emit student registered: new student');
						socket.emit('student registered', {
							userInfoArray : userInfoArray
						});
					}
				}
			}
		});
		
		/*
		var my_session = session_66; //Grupo 66
		var group = "66";
		if(students_66.indexOf(students[0])==-1){//67
			my_session = session_67;
			group = "67";
		}
		var emited = false;
		for(var i=0; i<students.length; i++){
			var found = false;
			
			for(var j=0; j<my_session.length; j++){
				if(students[i] == my_session[j].username){
					if(!emited){
						console.log('emit student registered:'+my_session[j].exercise);
						socket.emit('student registered', {exercise: my_session[j].exercise, help: my_session[j].help});
						emited = true;
					}
					found = true;
					break;
				}
			}
			if(!found){
				//Not found
				my_session.push({ 
					username: students[i],
					exercise: 0,
					help: false,
					IP: socket.handshake.address.address
				});
			}
		}
		*/
		//Save names to the socket
		//No merece la pena?
		//socket.set("username", students);
		//socket.set("group", group);
	});
	
	//New teacher connected
	socket.on("new teacher", function(session){
		console.log('new teacher: at session '+session.session);
		var my_session = getSession(session.session);
		var my_queue = getQueue(session.session);
		//console.log('new event(my_session):'+JSON.stringify(my_session));
		//console.log('new event(my_queue):'+JSON.stringify(my_queue));
		
		socket.emit('init', {session: my_session, queue: my_queue});
	});
	
	socket.on("disconnect", function(){
		/*
		socket.get('username', function(err, students){
			var index = 0; //Grupo 66
			if(students_66.indexOf(students[0])==-1){//67
				index = 1;
			}
			for(var i=0; i<students.length; i++){
				sessions[index].splice(sessions[index].indexOf(students[i]),1);
			}
		});
		*/
	});
});

app.listen(80);

console.log('Server running at http://127.0.0.1:80/');

