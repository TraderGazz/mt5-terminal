// Replace only the inspected trader-mt5.online HTTPS locations. Retain Certbot
// certificates/HTTP redirect verbatim; never touch mt-trader.ru configuration.
export function onlineReviewConfig(source){
 const name='server_name trader-mt5.online www.trader-mt5.online;';
 const index=source.indexOf(name),start=source.lastIndexOf('server {',index);
 if(index<0||start<0||source.slice(0,start).trim())throw new Error('Unexpected online config header');
 const ssl=source.indexOf('listen 443 ssl;',index),next=source.indexOf('\nserver {',index);
 if(ssl<0||(next>=0&&next<ssl)||source.includes('server_name mt-trader.ru')||!source.includes('/etc/letsencrypt/live/trader-mt5.online/fullchain.pem'))throw new Error('Unexpected domain/TLS configuration');
 const head=source.slice(start,ssl);
 if(!head.includes('127.0.0.1:4001')&&!head.includes('127.0.0.1:4004'))throw new Error('Unexpected current upstream');
 return `server {
    ${name}
    location / {
        proxy_pass http://127.0.0.1:4004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 75s;
        add_header Cache-Control "no-store" always;
    }
    location /ws {
        proxy_pass http://127.0.0.1:4004/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 75s;
    }
    `+source.slice(ssl);
}
