// Diagnostic only: compare the container decoder with the pre-migration packet path.
import {Input,ALL_FORMATS,BlobSource,AudioBufferSink} from '../../apps/web/node_modules/mediabunny';
export async function compareDecoders(url:string){
 const blob=await(await fetch(url)).blob(),context=new AudioContext({sampleRate:44100});
 try{const container=await context.decodeAudioData(await blob.arrayBuffer());const input=new Input({source:new BlobSource(blob),formats:ALL_FORMATS});
 try{const track=await input.getPrimaryAudioTrack();if(!track)throw Error('No audio');const chunks:AudioBuffer[]=[];let count=0;
 for await(const {buffer}of new AudioBufferSink(track).buffers(0)){chunks.push(buffer);count+=buffer.length;}
 const rate=chunks[0].sampleRate,channels=Math.min(2,chunks[0].numberOfChannels),native=context.createBuffer(channels,count,rate);let offset=0;
 for(const b of chunks){for(let c=0;c<channels;c++)native.getChannelData(c).set(b.getChannelData(Math.min(c,b.numberOfChannels-1)),offset);offset+=b.length;}
 const offline=new OfflineAudioContext(channels,Math.ceil(count*44100/rate),44100),node=offline.createBufferSource();node.buffer=native;node.connect(offline.destination);node.start();const packet=await offline.startRendering();
 function encode(b:AudioBuffer){const bytes=new Uint8Array(b.getChannelData(0).buffer);let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return{sampleRate:b.sampleRate,length:b.length,channels:b.numberOfChannels,base64:btoa(s)};}
 return{container:encode(container),packet:encode(packet)};
 }finally{input.dispose();}
 }finally{await context.close();}
}
