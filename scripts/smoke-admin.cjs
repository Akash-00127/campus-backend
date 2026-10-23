const fs=require('node:fs');const assert=require('node:assert/strict');
async function main(){
 const local=fs.readFileSync('.local/LOCAL-ACCESS.txt','utf8');
 const email=local.match(/^Email: (.+)$/m)[1].trim();const password=local.match(/^Password: (.+)$/m)[1].trim();
 const login=await fetch('http://127.0.0.1:4000/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,201);
 const {accessToken}=await login.json();
 for(const [tab,label] of [['overview','Commerce overview'],['universities','Add a university'],['campuses','Add a campus'],['vendors','Create a vendor account'],['orders','No records yet'],['users','Campus Drop Owner'],['settings','Student home content'],['support','No records yet'],['audit-logs','Audit history']]){
  const response=await fetch(`http://127.0.0.1:3000/?tab=${tab}`,{headers:{Cookie:`campus_admin_token=${accessToken}`},redirect:'manual'});
  assert.equal(response.status,200,`${tab} HTTP status`);const html=await response.text();assert.ok(html.includes(label),`${tab} expected content missing`);assert.ok(!html.includes('Unable to load data'),`${tab} failed to load`);console.log(`PASS admin ${tab}`);
 }
 const unauth=await fetch('http://127.0.0.1:3000/',{redirect:'manual'});assert.equal(unauth.status,307);console.log('PASS unauthenticated admin redirect');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
