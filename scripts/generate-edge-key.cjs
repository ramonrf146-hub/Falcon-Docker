const fs=require('node:fs'),{execFileSync}=require('node:child_process');
execFileSync('ssh-keygen',['-q','-t','ed25519','-f','.deployment/edge_cloud_key','-N','','-C','falcon-edge-link']);
fs.copyFileSync('.deployment/edge_cloud_key','.deployment/id_ed25519');
fs.copyFileSync('.deployment/edge_cloud_key.pub','.deployment/id_ed25519.pub');
fs.writeFileSync('.deployment/authorized-line','restrict,port-forwarding,permitlisten="127.0.0.1:18880",permitlisten="127.0.0.1:18882",permitopen="127.0.0.1:18881",command="/bin/false" '+fs.readFileSync('.deployment/id_ed25519.pub','utf8').trim()+'\n');
