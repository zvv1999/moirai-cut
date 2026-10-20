"use client";
import {useCallback,useEffect,useRef,useState} from "react";

// Playback interaction only; bounds come from the native aligned words.
export function useRangeAudition(src?:string) {
	const audio=useRef<HTMLAudioElement>(null);
	const sequence=useRef(0),frame=useRef(0);
	const [playingKey,setPlayingKey]=useState<string|null>(null),[error,setError]=useState("");
	const stop=useCallback(()=>{sequence.current++;cancelAnimationFrame(frame.current);audio.current?.pause();setPlayingKey(null);},[]);
	useEffect(()=>{
		const media=audio.current;if(media&&src)media.setAttribute("src",src);
		const hidden=()=>{if(document.hidden)stop();};
		document.addEventListener("visibilitychange",hidden);
		return()=>{sequence.current++;cancelAnimationFrame(frame.current);media?.pause();media?.removeAttribute("src");media?.load();document.removeEventListener("visibilitychange",hidden);};
	},[src,stop]);
	async function play(key:string,start:number,end:number){
		if(playingKey===key){stop();return;}
		stop();setError("");
		const media=audio.current,request=sequence.current;
		if(!media||!src)return;
		try{
			(media.closest(".template-workbench")??media.closest(".tp"))?.querySelectorAll<HTMLMediaElement>("audio,video").forEach(other=>{if(other!==media)other.pause();});
			media.currentTime=start;
			await media.play();
			if(request!==sequence.current)return;
			setPlayingKey(key);
			const tick=()=>{
				if(request!==sequence.current)return;
				if(media.currentTime>=end||media.ended){stop();return;}
				frame.current=requestAnimationFrame(tick);
			};
			tick();
		}catch(cause){if(request===sequence.current){stop();setError(cause instanceof Error?`无法试听：${cause.message}`:"无法试听这段声音");}}
	}
	return {audio,playingKey,error,play,stop};
}
