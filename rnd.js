import redis from "redis";
import rejson from "redis-rejson"
import { promisify } from "util";

rejson(redis);
redis.addCommand('json.qget');

const users = [
    {
        _id: 1,
        email:'suresh.saini@gamechangesns.com',
        name: 'suresh kumar saini',
        isActive: true
    },
    {
        _id: 2,
        email:'suresh-saini@gamechangesns.com',
        name: 'suresh saini kumar',
        isActive: false
    },
    {
        _id: 3,
        email:'suresh.saini@gamechangesns.com',
        name: 'suresh-saini',
        isActive: true
    }
]
export class Rnd {
    async main() {
        const redisClient = await redis.createClient();

        ['get', 'set', 'json_get', 'json_set', 'json_del', 'json_arrappend', 'json_qget', 'quit', 'send_command'].forEach((methodName) => {
            redisClient[`${methodName}Async`] = promisify(redisClient[methodName]);
        });
        await Promise.all(users.map(user => {
            return redisClient.json_setAsync(`user:${user._id}`, ".", JSON.stringify(user), "index", "user")
        }))        
        await redisClient.send_commandAsync('JSON.index', ['add', 'user', 'email', '$.email']).catch(e=>console.warn(e.message))
        await redisClient.send_commandAsync('JSON.index', ['add', 'user', 'name', '$.name']).catch(e=>console.warn(e.message))
        await redisClient.send_commandAsync('JSON.index', ['add', 'user', 'isActive', '$.isActive']).catch(e=>console.warn(e.message))
        console.log('user based on email=suresh-saini@gamechangesns.com is:', await redisClient.json_qgetAsync('user', '@email:"suresh\\-saini\\@gamechangesns\\.com"').catch(e=>e.message))
        console.log('user based on name=suresh saini is', await redisClient.json_qgetAsync('user', '@name:"suresh\\ saini"').catch(e=>e.message))
        console.log('user based on isActive=false is', await redisClient.json_qgetAsync('user', '@isActive:false').catch(e=>e.message))
        await redisClient.quitAsync();
    }
}
new Rnd().main().then(() => {
    console.log("done")
}).catch(e=>console.log(e.stack))