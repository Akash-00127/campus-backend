// Explicit local-only bootstrap. Never connects to an operator's DATABASE_URL.
const fs=require('node:fs');const path=require('node:path');const {randomBytes}=require('node:crypto');
async function main(){
 const envPath=path.resolve('.env');const old=fs.existsSync(envPath)?fs.readFileSync(envPath,'utf8'):'';
 const existing=require('dotenv').parse(old);
 if(Object.keys(existing).length)throw new Error('Existing backend configuration detected; refusing to overwrite.');
 const jwt=randomBytes(48).toString('base64url');const password=randomBytes(24).toString('base64url');
 process.env.DATABASE_URL='postgresql://campus_test@127.0.0.1:55439/campus_drop_dev';
 const {dataSource}=require('../dist/database/data-source');await dataSource.initialize();
 try{
  await dataSource.runMigrations();
  const {User,UserRole}=require('../dist/platform/entities');const bcrypt=require('bcrypt');
  const email='owner@campusdrop.local';if(await dataSource.getRepository(User).existsBy({email}))throw new Error('Local owner account already exists; refusing reset.');
  await dataSource.getRepository(User).save({name:'Campus Drop Owner',email,passwordHash:await bcrypt.hash(password,12),role:UserRole.SUPER_ADMIN,verified:true});
  fs.writeFileSync(envPath,`${old}\n# Local development only\nDATABASE_URL=${process.env.DATABASE_URL}\nJWT_SECRET=${jwt}\nDELIVERY_PIN_SECRET=${randomBytes(48).toString('base64url')}\nPORT=4000\nCORS_ORIGIN=http://localhost:3000\n`);
  fs.mkdirSync('.local',{recursive:true});fs.writeFileSync('.local/LOCAL-ACCESS.txt',`LOCAL DEVELOPMENT ONLY\nAdmin: http://localhost:3000\nEmail: ${email}\nPassword: ${password}\n\nNo business data was seeded. Create a real university and campus in the admin panel.\nTest database: campus_drop_test (contains isolated test fixtures)\nDevelopment database: campus_drop_dev (only the owner account)\nDo not deploy this localhost trust-authenticated PostgreSQL cluster.\n`);
  console.log('Local development database migrated. Owner credentials saved in .local/LOCAL-ACCESS.txt (not printed).');
 }finally{await dataSource.destroy();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
