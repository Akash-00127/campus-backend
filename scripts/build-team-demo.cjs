// Generates a shareable data-only SQL fixture; never reads private database rows.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const bcrypt = require('bcrypt');
const out = path.join(__dirname, '../demo-data');
const id = key => { const s=createHash('sha256').update('campus-drop-team-demo-v1:'+key).digest('hex'); return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`; };
const quote = value => value == null ? 'NULL' : typeof value === 'boolean' ? String(value) : typeof value === 'number' ? String(value) : "'"+String(value).replaceAll("'","''")+"'";
const groups = {
 'Hot beverages': ['Masala Chai','Ginger Tea','Filter Coffee','Hot Chocolate','Green Tea'],
 'Cold beverages': ['Cold Coffee','Lemon Soda','Mango Lassi','Sweet Lassi','Iced Tea','Fresh Lime Water'],
 'Breakfast': ['Aloo Paratha','Paneer Paratha','Poha','Upma','Idli Sambar','Masala Dosa','Plain Dosa','Uttapam','Chole Bhature'],
 'North Indian meals': ['Dal Tadka','Dal Makhani','Rajma Rice','Chole Rice','Paneer Butter Masala','Kadai Paneer','Veg Thali','Butter Naan','Tandoori Roti','Jeera Rice'],
 'Biryani': ['Veg Biryani','Paneer Biryani','Chicken Biryani','Egg Biryani','Mutton Biryani'],
 'Snacks': ['Samosa','Bread Pakora','Onion Pakora','Vada Pav','Pav Bhaji','Pani Puri','Aloo Tikki','French Fries'],
 'Burgers and sandwiches': ['Veg Burger','Cheese Burger','Chicken Burger','Grilled Cheese Sandwich','Veg Club Sandwich'],
 'Pizza and pasta': ['Margherita Pizza','Farmhouse Pizza','Chicken Pizza','White Sauce Pasta','Red Sauce Pasta'],
 'Chinese': ['Veg Hakka Noodles','Chicken Hakka Noodles','Veg Fried Rice','Egg Fried Rice','Veg Manchurian','Chilli Paneer','Chilli Chicken','Veg Momos','Chicken Momos'],
 'Rolls and Maggi': ['Masala Maggi','Cheese Maggi','Chicken Maggi','Paneer Roll','Egg Roll','Chicken Roll'],
 'Non-veg meals': ['Butter Chicken','Chicken Curry','Egg Curry','Fish Curry','Chicken Tikka'],
 'Desserts and shakes': ['Gulab Jamun','Rasgulla','Kheer','Chocolate Brownie','Vanilla Ice Cream','Chocolate Shake','Strawberry Shake','Oreo Shake'],
 'Packaged essentials': ['Bottled Water','Salted Chips','Biscuits','Fruit Juice']
};
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const source='https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json';
 const response=await fetch(source); if(!response.ok)throw Error('University source unavailable');
 const all=await response.json();
 const unique=new Map();
 for(const u of all)if(u.country==='India' && /university/i.test(u.name)) unique.set(u.name.trim().toLowerCase(),u);
 unique.delete('guru kashi university');
 const universities=[{name:'Guru Kashi University',country:'India','state-province':'Punjab',web_pages:['https://gku.ac.in/']},...Array.from(unique.values()).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,149)];
 if(universities.length!==150)throw Error('Expected 150 distinct universities');
 fs.writeFileSync(path.join(out,'universities.json'),JSON.stringify(universities,null,2));
 const license=await fetch('https://raw.githubusercontent.com/Hipo/university-domains-list/master/LICENSE.txt');if(!license.ok)throw Error('License unavailable');fs.writeFileSync(path.join(out,'UNIVERSITY-SOURCE-LICENSE.txt'),await license.text());
 const hash=await bcrypt.hash('CampusDemo@2026!',12);
 const sql=['-- Campus Drop DEMO fixture. Data only: run project migrations first.', '-- Never import known-password demo accounts into production.','BEGIN;'];
 const counts={};
 function insert(table,row){ counts[table]=(counts[table]||0)+1;sql.push(`INSERT INTO "${table}" (${Object.keys(row).map(k=>'"'+k+'"').join(',')}) VALUES (${Object.values(row).map(quote).join(',')}) ON CONFLICT DO NOTHING;`); }
 const photo='https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=800&q=80';
 universities.forEach((u,index)=>{
  const key=u.name.toLowerCase();const uid=id('university:'+key),cid=id('campus:'+key);
  insert('universities',{id:uid,slug:'demo-'+key.replace(/[^a-z0-9]+/g,'-'),name:u.name,officialName:u.name,state:u['state-province']||'Not verified',city:u.name==='Guru Kashi University'?'Talwandi Sabo':'Not verified',type:u.name==='Guru Kashi University'?'PRIVATE':'OTHER',website:u.web_pages[0],verified:false});
  insert('campuses',{id:cid,universityId:uid,slug:'demo-campus',name:'Demo Campus',address:'Fictional demonstration service area',serviceEnabled:true,codEnabled:true});
  const vendors=[];
  for(let n=0;n<2;n++){
   const owner=id('owner:'+key+n),vid=id('vendor:'+key+n);vendors.push(vid);
   insert('users',{id:owner,name:`Demo Seller ${index+1}-${n+1}`,email:`seller${index+1}.${n+1}@demo.campusdrop.test`,passwordHash:hash,role:'VENDOR',universityId:uid,campusId:cid,verified:true});
   insert('vendors',{id:vid,slug:`team-demo-${index+1}-${n+1}`,name:n?'Demo Snacks & Drinks':'Demo Campus Kitchen',ownerId:owner,universityId:uid,campusId:cid,address:'Demo Campus',description:'Fictional shop with sample menu and prices. Not an affiliated real vendor.',operatingStatus:'OPEN',approvalStatus:'APPROVED',verified:true,codEnabled:true,commissionRateBps:1500,preparationMinutes:15,coverImage:photo,operatingHours:JSON.stringify({alwaysOpen:true,open:'00:00',close:'23:59'})});
  }
  Object.entries(groups).forEach(([category,dishes],g)=>{
   const categoryId=id('category:'+key+category);insert('categories',{id:categoryId,universityId:uid,name:category,image:photo,active:true});
   dishes.forEach((name,p)=>insert('products',{id:id('product:'+key+name),vendorId:vendors[g%2],universityId:uid,campusId:cid,categoryId,name,description:'Demo menu item. Sample pricing and illustrative image; availability is for testing only.',pricePaise:(30+g*10+p*5)*100,image:photo,vegetarian:!(/chicken|egg|mutton|fish/i.test(name)),stock:100,active:true,available:true}));
  });
  ['Ramesh','Mahesh','Atul'].forEach((name,n)=>{
   const userId=id('student:'+key+name);const email=index===0?`${name.toLowerCase()}@demo.campusdrop.test`:`${name.toLowerCase()}.${index+1}@demo.campusdrop.test`;
   insert('users',{id:userId,name:name+' (Demo)',email,passwordHash:hash,role:'STUDENT',universityId:uid,campusId:cid,verified:true});
   insert('addresses',{id:id('address:'+key+name),userId,campusId:cid,label:'Demo Hostel',building:'Demo Block A',details:'Room '+(101+n)+' — fictional test address',phone:'0000000000'});
  });
 });
 sql.push('COMMIT;'); fs.writeFileSync(path.join(out,'campus-drop-demo.sql'),sql.join('\n')+'\n');
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({source,retrieved:new Date().toISOString(),note:'Community university directory, not certification of UGC recognition. Unknown locations/types are not verified. All campuses, shops, prices and users are fictional.',counts},null,2));
 console.log(counts);
}
main().catch(e=>{console.error(e);process.exitCode=1});
