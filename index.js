var app = require('http').createServer(handler);
var io = require('socket.io')(app);
var fs = require('fs');

app.listen(process.env.PORT);

function handler(req, res) {
    fs.readFile(__dirname + '/public/client.html', function(err, data) {
        if (err) {
            res.writeHead(500);
            return res.end('Error loading client.html');
        }

        res.writeHead(200);
        res.end(data);
    });
}


function getRandomColor() {
    let letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; ++i) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}


class InputData {
    constructor(num) {
        this.num = num;
        this.w = false;
        this.s = false;
        this.a = false;
        this.d = false;
    }
}

class Ball {
    constructor(socket) {
        this.socket = socket;
        this.x = 0;
        this.y = 0;
        this.color = getRandomColor();
        this.inputMap = {};
        this.inputBuffer = [];
        this.lastInputNum = 0;
    }
    
    get id() {
        return this.socket.id;
    }
    
    checkKey(key) {
        return this.inputMap[key];
    }
    
    pushInput(inputData) {
        this.inputBuffer.push(inputData);
    }
    
    applyInputs() {
        let left = this.inputBuffer.length;
        
        while (left > 0) {
            left -= 1;
            let input = this.inputBuffer.shift();
            
            if (input.num > this.lastInputNum) {
                this.lastInputNum = input.num;
                
                this.inputMap.w = input.w;
                this.inputMap.s = input.s;
                this.inputMap.a = input.a;
                this.inputMap.d = input.d;
            }
        }
    }
    
    handleInput(timeRate) {
        let vx = 0;
        let vy = 0;
        
        if (this.checkKey('w')) {
            vy = -4;
        }
        if (this.checkKey('s')) {
            vy = 4;
        }
        if (this.checkKey('a')) {
            vx = -4;
        }
        if (this.checkKey('d')) {
            vx = 4;
        }
        
        this.x += vx * timeRate;
        this.y += vy * timeRate;
    }
}


var balls = [];
var ballMap = {};


function joinGame(socket) {
    let ball = new Ball(socket);
    
    balls.push(ball);
    ballMap[socket.id] = ball;
    
    return ball;
}

function leaveGame(socket) {
    for (let i = 0; i < balls.length; ++i) {
        if (balls[i].id == socket.id) {
            balls.splice(i, 1);
            break;
        }
    }
    
    delete ballMap[socket.id];
}

function onInput(socket, data) {
    let ball = ballMap[socket.id];
    
    let inputData = new InputData(data.num);
    inputData.w = data.w || false;
    inputData.s = data.s || false;
    inputData.a = data.a || false;
    inputData.d = data.d || false;
    
    ball.pushInput(inputData);
}


io.on('connection', function(socket) {
    console.log(`${socket.id} has joined!`);
    
    socket.on('disconnect', function(reason) {
        console.log(`${socket.id} has leaved! (${reason})`);
        
        leaveGame(socket);
        
        socket.broadcast.emit('leave_user', socket.id);
    });
    
    socket.on('input', function(data) {
        onInput(socket, data);
    });
    
    
    let newBall = joinGame(socket);
    
    socket.emit('user_id', socket.id);
    
    // Send data of users already in game.
    for (let i = 0; i < balls.length; ++i) {
        let ball = balls[i];
        
        socket.emit('join_user', {
            id: ball.id,
            x: ball.x,
            y: ball.y,
            color: ball.color,
        });
    }
    
    // Send data of a new user.
    socket.broadcast.emit('join_user', {
        id: socket.id,
        x: newBall.x,
        y: newBall.y,
        color: newBall.color,
    });
});


var prevUpdateTime = new Date().getTime();
var stateNum = 0;

function updateGame() {
    let currentUpdateTime = new Date().getTime();
    let deltaTime = currentUpdateTime - prevUpdateTime;
    prevUpdateTime = currentUpdateTime;
    
    let timeRate = deltaTime / (1000 / 60);
    
    for (let i = 0; i < balls.length; ++i) {
        let ball = balls[i];
        
        ball.applyInputs();
        
        ball.handleInput(timeRate);
    }
    
    setTimeout(updateGame, 16);
}

function broadcastState() {
    stateNum += 1;
    
    let data = {};
    
    data.state_num = stateNum;
    
    for (let i = 0; i < balls.length; ++i) {
        let ball = balls[i];
        
        data[ball.id] = {
            last_input_num: ball.lastInputNum,
            x: ball.x,
            y: ball.y,
        };
    }
    
    io.sockets.emit('update_state', data);
    
    setTimeout(broadcastState, 33);
}

updateGame();
broadcastState();

