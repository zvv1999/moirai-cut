/** Source containment is shared by composition and interactive frame bounds. */
export function containedSourceSize(canvas: {width:number;height:number}, source: {width:number;height:number}) {
	const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
	return {width: source.width * scale, height: source.height * scale};
}
