import type { Transform } from "@/rendering";
export type Basis = [number, number, number, number];
export type Point = { x: number; y: number };
export const identityBasis = (): Basis => [1, 0, 0, 1];
function finite<T extends number[]>(values: T): T {
	if (!values.every(Number.isFinite)) throw new Error("Nonfinite attachment basis");
	return values;
}
export function transformBasis(t: Transform): Basis {
	if (t.basis) return finite([...t.basis]) as Basis;
	const r = t.rotate * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
	return finite([c * t.scaleX, s * t.scaleX, -s * t.scaleY, c * t.scaleY]) as Basis;
}
export function multiplyBasis(a: Basis, b: Basis): Basis {
	return finite([a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3]]) as Basis;
}
export function inverseBasis(a: Basis): Basis {
	const det = a[0]*a[3]-a[1]*a[2];
	if (!Number.isFinite(det) || Math.abs(det)<1e-12) throw new Error("Text attachment destination has a singular group transform");
	return finite([a[3]/det,-a[1]/det,-a[2]/det,a[0]/det]) as Basis;
}
export function basisVector(a: Basis, p: Point): Point {
	const [x,y]=finite([a[0]*p.x+a[2]*p.y,a[1]*p.x+a[3]*p.y]);
	return {x,y};
}
export function groupBasis(groups: readonly Transform[]): Basis {
	return groups.reduce((result,t)=>multiplyBasis(result,transformBasis(t)),identityBasis());
}
export function groupPoint(p: Point, groups: readonly Transform[], inverse=false): Point {
	const ordered=inverse ? groups : [...groups].reverse();
	for(const t of ordered) {
		if(inverse) p=basisVector(inverseBasis(transformBasis(t)),{x:p.x-t.position.x,y:p.y-t.position.y});
		else {p=basisVector(transformBasis(t),p);p={x:p.x+t.position.x,y:p.y+t.position.y};}
		finite([p.x,p.y]);
	}
	return p;
}
