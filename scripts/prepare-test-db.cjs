const fs=require('node:fs');
const {Client}=require('pg');
async function main(){
 const client=new Client({connectionString:'postgresql://campus_test@127.0.0.1:55439/postgres'});await client.connect();
 for(const name of ['campus_drop_test','campus_drop_dev']){
  if(!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)await client.query(`CREATE DATABASE ${name}`);
 }
 await client.end();
 process.env.DATABASE_URL='postgresql://campus_test@127.0.0.1:55439/campus_drop_test';
 const {dataSource}=require('../dist/database/data-source');await dataSource.initialize();
 try{
  const schema=await dataSource.driver.createSchemaBuilder().log();
  fs.mkdirSync('src/database/migrations',{recursive:true});
  const statements=schema.upQueries.map(q=>q.query);
  const source=`import { MigrationInterface, QueryRunner } from 'typeorm';\nexport class InitialCampusDrop1790121600000 implements MigrationInterface {\n  async up(queryRunner: QueryRunner): Promise<void> {\n    const statements = ${JSON.stringify(statements,null,2)};\n    for (const statement of statements) await queryRunner.query(statement);\n  }\n  async down(): Promise<void> { throw new Error('Restore a reviewed backup; automatic deletion of commerce data is disabled.'); }\n}\n`;
  const file='src/database/migrations/1790121600000-InitialCampusDrop.ts';
  if(fs.existsSync(file))throw new Error('Initial migration already exists; refusing to overwrite.');
  fs.writeFileSync(file,source);console.log(`Generated initial migration: ${statements.length} SQL statements. Test database remains empty.`);
 }finally{await dataSource.destroy();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
