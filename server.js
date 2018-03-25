// Get env variables
require('dotenv').config();

// Packages
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const hueApi = require('node-hue-api');

// Modules
const Hue = require('./modules/hue.js');
const Spotify = require('./modules/spotify.js');

// Express app.use
app.use(express.static(__dirname + '/webpages/css'));
app.use(express.static(__dirname + '/webpages/js'));
app.use(express.static(__dirname + '/webpages/include'));
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/webpages/index.html');
});

// Global variables
let hue = null;
const port = 3000;
const searchInterval = 0.5 * 1000; // first number is the amount of seconds to wait
let status = {
  hue: {
    light_1: null
  }
}

const spotify = new Spotify({
  app: app,
  client_id: process.env.SPOTIFY_CLIENT_ID,
  client_secret: process.env.SPOTIFY_CLIENT_SECRET,
  redirect_uri: `http://localhost:${port}`,
  redirect_endpoint: '/spotify/callback'
});

/**
 * Start the server
 */
http.listen(port, function(){
  console.log('listening on ' + port);
});

/**
 * Get the Hue bridge IP as soon as the server starts
 * TODO handle more than one bridge on a network
 */
hueApi.nupnpSearch(function(err, bridges) {
    if (err) throw err;
    let opts = {
      user: process.env.HUE_USER,
      bridge: bridges[0]
    }
    hue = new Hue(opts);
});


/**
 * Socket.io
 */
io.on('connection', function(socket) {
  console.log('a user connected');
  sendStatus();
  socket.on('disconnect', function(){
   console.log('user disconnected');
  });
  hueSocket(socket);
  spotifySocket(socket);

});

function hueSocket(socket) {
  socket.on('hue:light_1', function() {
   console.log('received');
   hue.toggle();
  });
}

function spotifySocket(socket) {
  // Auth
  spotify.authorized(function(auth, url) {
   io.emit('spotify_authenticated', { auth: auth, url: url });
  });

  socket.on('spotify-play-pause', function(play) {
    if (play) {
      spotify.play(function(err) {
        if (err) console.error(err);
      });
    } else {
      spotify.pause(function(err) {
        if (err) console.error(err);
      });
    }
  })

  socket.on('spotify-next', function() {
    spotify.next(function(err) {
      if (err) console.error(err);
    });
  });

  socket.on('spotify-previous', function() {
    spotify.previous(function(err) {
      if (err) console.error(err);
    });
  });

  socket.on('spotify-repeat', function(repeat) {
    spotify.repeat({ state: repeat }, function(err, data) {
      if (err) console.error(err);
    });
  })

  socket.on('spotify-shuffle', function(shuffle) {
    spotify.shuffle({ state: shuffle }, function(err) {
      if (err) console.error(err);
    });
  })

  socket.on('spotify-volume', function(vol) {
    spotify.volume(vol, {}, function(err) {
      if (err) console.error(err);
    });
  })

}


//
//
// Functions
//
//

/**
 * Function to get the status of different smart home devices
 */
function getStatus() {
  if (hue) {
    hue.lightStatus(1, function(err, result) {
      status.hue.light_1 = result.state.on;
    });
  }
  spotify.authorized(function(auth) {
    if (auth) {
      spotify.getPlaybackInfo(function(err, data) {
        if (data && data.item) {
          let s = {
            now_playing: {
              playing: data.is_playing,
              name: data.item.name,
              artists: data.item.album.artists,
              images: data.item.album.images
            },
            player_info: {
              repeat: data.repeat_state,
              shuffle: data.shuffle_state,
              volume: data.device.volume_percent
            }
          }
          status.spotify = s;
        }
      });
    }
  });
  sendStatus();
}

/**
 * Function to send the status of different smart home devices to the UI
 */
function sendStatus() {
  io.emit('status', status)
}

setInterval(getStatus, searchInterval);
