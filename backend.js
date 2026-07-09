const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MODELS = require('./model');
const crypto = require('crypto');

const userModels = {};
const userCreations = {};

function validateMSX(instruction) {
  const errors = [];
  if (!instruction.startsWith('LX*MX')) errors.push('Start with LX*MX');
  if (!instruction.endsWith('LX*MX')) errors.push('End with LX*MX');
  if (/[\u{1F600}-\u{1F64F}]/u.test(instruction)) errors.push('No emojis');
  if (!instruction.match(/\[(.*?)\]/g)) errors.push('Use [] for sentences');
  return { valid: errors.length === 0, errors };
}

function generatePassword() {
  return crypto.randomBytes(13).toString('hex').substring(0,25).toUpperCase();
}

function setupAuth(app) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
  }, (a,b,p,done) => done(null, { id: p.id, name: p.displayName, email: p.emails[0].value, photo: p.photos[0].value })));

  passport.serializeUser((u,d)=>d(null,u));
  passport.deserializeUser((u,d)=>d(null,u));
  app.get('/auth/google', passport.authenticate('google',{scope:['profile','email']}));
  app.get('/auth/google/callback', passport.authenticate('google',{failureRedirect:'/'}), (req,res)=>res.redirect('/'));
}

function setupAPI(app) {
  app.get('/api/user', (req,res)=>res.json({ user: req.user || null, creations: userCreations[req.user?.id] || 0 }));
  app.get('/api/models', (req,res)=>res.json({ internal: MODELS.internal, external: userModels[req.user?.id] || {} }));

  app.post('/api/create-model', (req,res)=>{
    if(!req.user) return res.json({error:'Login required'});
    const { name, version, apiKey, instruction, modelNumber } = req.body;
    const userId = req.user.id;
    const creations = userCreations[userId] || 0;
    let cost = creations===0?0:creations===1?7999:creations===2?8999:9999;

    const validation = validateMSX(instruction);
    if(!validation.valid) return res.json({error:'MSX: '+validation.errors.join(', ')});
    if(creations>=1 && cost>0) return res.json({error:`Pay ₹${cost}`, requiresPayment:true, cost});

    const pwd = generatePassword();
    if(!userModels[userId]) userModels[userId]={};
    userModels[userId][name]={version, apiKey, instruction, modelNumber, password:pwd, createdAt:new Date()};
    userCreations[userId]=creations+1;

    res.json({success:true, modelName:name, modelNumber, modelPassword:pwd, warning:creations===0?'Next model ₹7,999':null});
  });

  app.post('/api/chat', async (req,res)=>{
    const { model, message, type } = req.body;
    const models = type==='external'? (userModels[req.user?.id]||{}) : MODELS.internal;
    const m = models[model];
    if(!m) return res.json({error:'Model not found'});

    // GEMINI API CALL (use free tier)
    const apiKey = process.env.GEMINI_API_KEY;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m.api}:generateContent?key=${apiKey}`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: m.instruction + "\n\nUser: " + message }]}] })
      });
      const data = await response.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
      res.json({ reply, model });
    } catch(e) {
      res.json({ reply: `[${model}]\n${m.instruction}\n\nDemo mode - add GEMINI_API_KEY`, model });
    }
  });
}

module.exports = { setupAuth, setupAPI };
