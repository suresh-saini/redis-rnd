const redis = require("redis");
const rejson = require("redis-rejson")
const { promisify } = require("util");
const protobuf = require('protocol-buffers')
const protobufjs = require('protobufjs')
const protobufg = require('google-proto-files')
const rawLead = require("./lead")
const fs = require('fs')
const { gzip } = require('zlib')
const { decode, encode } = require('messagepack')

const pgzip = promisify(gzip);
rejson(redis);
redis.addCommand('json.qget');
redis.addCommand('pb.set');
redis.addCommand('pb.get');

const users = [
    {
        _id: 1,
        email: 'suresh.saini@gamechangesns.com',
        name: 'suresh kumar saini',
        isActive: true
    },
    {
        _id: 2,
        email: 'suresh-saini@gamechangesns.com',
        name: 'suresh saini kumar',
        isActive: false
    },
    {
        _id: 3,
        email: 'suresh.saini@gamechangesns.com',
        name: 'suresh-saini',
        isActive: true
    }
]

const messages = protobuf(fs.readFileSync('./lead.proto'));
const messagesJs = (protobufjs.loadSync("./lead.proto")).lookup('Lead');
const messagesG = (protobufg.loadSync('./lead.proto')).lookup('Lead')

class Rnd {
    async getClient() {
        const redisClient = await redis.createClient({ port: 6380 });

        ['get', 'mget','set', 'json_get', 'json_set', 'json_del', 'json_arrappend', 'json_qget', 'quit', 'send_command', 'pb_set', 'pb_get'].forEach((methodName) => {
            redisClient[`${methodName}Async`] = promisify(redisClient[methodName]);
        });
        return redisClient
    }
    async qget() { //qget rnd
        const redisClient = await this.getClient();

        await Promise.all(users.map(user => {
            return redisClient.json_setAsync(`user:${user._id}`, ".", JSON.stringify(user), "index", "user")
        }))
        await redisClient.send_commandAsync('JSON.index', ['add', 'user', 'email', '$.email']).catch(e => console.warn(e.message))
        await redisClient.send_commandAsync('JSON.index', ['add', 'user', 'name', '$.name']).catch(e => console.warn(e.message))
        await redisClient.send_commandAsync('JSON.index', ['add', 'user', 'isActive', '$.isActive']).catch(e => console.warn(e.message))
        console.log('user based on email=suresh-saini@gamechangesns.com is:', await redisClient.json_qgetAsync('user', '@email:"suresh\\-saini\\@gamechangesns\\.com"').catch(e => e.message))
        console.log('user based on name=suresh saini is', await redisClient.json_qgetAsync('user', '@name:"suresh\\ saini"').catch(e => e.message))
        console.log('user based on isActive=false is', await redisClient.json_qgetAsync('user', '@isActive:false').catch(e => e.message))
        await redisClient.quitAsync();
    }
    async loadLeads() {// RAM consumption test
        const lead = rawLead
        const redisClient = await this.getClient();
        let batch = []
        let contactNumber = 6587253675
        for (let i = 0; i < 100000; i++) {
            lead.contact.contactNumbers = contactNumber.toString()
            contactNumber += 1
            // const encodedLead = messages.Lead.encode(lead)
            const encodedLead = messagesJs.fromObject(lead)
            // messages.Lead.decode(encodedLead)
            // console.log(encodedLead)
            // batch.push(['SET', `lead:${i}`, encodedLead.toString()])
            // batch.push(['HSET', `lead:${i}`, Object.entries(lead).reduce((pv,cv)=>{pv.push(...cv); return pv;},[])])
            // batch.push(['SET', `lead:${i}`, JSON.stringify(lead)])
            // batch.push(['JSON.SET', `lead:${i}`, ".", JSON.stringify(lead)])
            // batch.push(['PB.SET', `lead:${i}`, "Lead", JSON.stringify(lead)])
            // batch.push(['JSON.SET', `lead:${i}`, ".", JSON.stringify(lead), "index", 'lead'])
            // batch.push(['SADD', `i:lead.cn:${contactNumber.toString()}`, `lead:${i}`])
            // batch.push(['SADD', `i:lead.brn:${lead.brn}`, `lead:${i}`])
            if (i % 1000 === 0) {
                const rbatch = redisClient.batch(batch);
                rbatch.execAsync = promisify(rbatch.exec)
                await rbatch.execAsync().catch((e) => console.warn(e));
                batch = []
            }
        }
        const rbatch = redisClient.batch(batch);
        rbatch.execAsync = promisify(rbatch.exec)
        await rbatch.execAsync().catch((e) => console.warn(e));
        await redisClient.quitAsync();
    }
    async getLead() {
        const redisClient = await this.getClient();
        const lead1 = messages.Lead.encode(rawLead)
        const res=await redisClient.mgetAsync('leads:10', 'sdf')
        console.log('res:', res)
        // const lead = Buffer.from(await redisClient.getAsync('lead:0'), 'binary')
        // lead.forEach((val, index) => {
        //     if (val !== lead1[index]) console.log(index, lead1[index], val)
        // })
        // console.log(lead.length, lead1.length, lead, lead1)
        // console.log(messages.Lead.decode(lead))
        await redisClient.quitAsync();
    }
    async test() {
        // const lead=flatten(rawLead)
        const lead = rawLead
        console.log(messagesJs.verify(rawLead))
        const lead2 = messagesJs.encode(messagesJs.create(rawLead)).finish()
        const lead3 = messagesG.encode(messagesG.create(rawLead)).finish()
        console.log("protobuff encoded length:", messages.Lead.encode(lead))
        console.log("protobuffJs encoded length:", lead2)
        console.log("protobuffG encoded length:", lead3)
        console.log("gziped protobuff encoded length:", (await pgzip(messages.Lead.encode(lead))).length)
        console.log("JSON length:", JSON.stringify(lead).length)
        console.log("gziped JSON length:", (await pgzip(JSON.stringify(lead))).length)
        console.log("message pack encoded length:", encode(lead).length)
        console.log("gziped message pack encoded length:", (await pgzip(encode(lead))).length)
    }
}
function flatten(obj) {
    const res = {}
    Object.entries(obj).forEach(([key, value]) => {
        if (typeof value !== 'object') res[key] = value
        else if (value instanceof Array) {
            res[key] = JSON.stringify(value)
        } else {
            const fvalue = flatten(value)
            Object.entries(fvalue).forEach(([subKey, subValue]) => {
                res[`${key}.${subKey}`] = subValue
            })
        }
    })
    return res
}

const startTime = Date.now()
new Rnd().loadLeads().then(() => {
    console.log("done time taken is:", (Date.now() - startTime) / 1000)
}).catch(e => console.log(e.stack))
