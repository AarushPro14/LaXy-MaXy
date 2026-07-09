require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const { setupAuth, setupAPI } = require('./backend');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({limit:'10mb'}));
app.use(session({secret:'laxymaxy_ultra_2026',resave:false,saveUninitialized:false}));
app.use(passport.initialize());
app.use(passport.session());

setupAuth(app);
setupAPI(app);
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'frontend.html')));

app.listen(PORT, ()=>console.log(`🚀 LaXy MaXy LIVE at http://localhost:${PORT}`));
