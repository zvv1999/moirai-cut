import {expect,test} from "bun:test";
import {ExportTextMeasurementCollector} from "../export-text-measurements";
import type {FrameTextMeasurement} from "../text-measurements";

function frame(time:number,font=20):FrameTextMeasurement {
 return {source:{elementId:"e",trackId:"t",groupPath:[],sceneTimeOffset:0},sceneTime:time,localTime:time-7,
 textBox:{left:0,top:0,width:40,height:20},transform:{position:{x:10,y:0},scaleX:1,scaleY:1,rotate:0},groups:[],
 layout:{fontSizePx:font,fontString:`${font}px Arial`,lines:["hello"],lineCount:1,widthPx:40,heightPx:20,limits:{maxWidthPx:0,maxHeightPx:0,maxLines:0},overflow:{width:false,height:false,lines:false},fontIdentityVerified:false}};
}
test("same layout and full pose merge consecutive observations, preserving observed clocks",()=>{
 const collector=new ExportTextMeasurementCollector();
 collector.observe([frame(10)]);collector.observe([frame(20)]);
 collector.observe([frame(30,21)]);collector.observe([]);collector.observe([frame(50,21)]);
 const value=collector.snapshot();expect(value.framesObserved).toBe(5);expect(value.records).toHaveLength(3);
 expect(value.records[0].sampleCount).toBe(2);expect(value.records[0].lastSceneTime).toBe(20);
 expect(value.records[0].lastLocalTime).toBe(13);expect(value.records[0].transform.position.x).toBe(10);
 value.records[0].layout.lines[0]="mutated";expect(collector.snapshot().records[0].layout.lines).toEqual(["hello"]);
});
test("bounded collection marks omissions without claiming full measurements",()=>{
 const collector=new ExportTextMeasurementCollector(1);
 collector.observe([frame(10)]);collector.observe([frame(20,21)]);collector.observe([frame(30,22)]);
 expect(collector.snapshot().records).toHaveLength(1);expect(collector.snapshot().droppedRecords).toBe(2);
 const large=frame(40);large.layout.lines=["x".repeat(32769)];
 const bounded=new ExportTextMeasurementCollector();bounded.observe([large]);
 expect(bounded.snapshot().records).toHaveLength(0);expect(bounded.snapshot().droppedRecords).toBe(1);
});

 test("layout identity never hides animated leaf, ancestor or box geometry",()=>{
 const collector=new ExportTextMeasurementCollector();
 const first=frame(0); collector.observe([first]);
 const second=frame(1);second.transform.scaleX=.25;collector.observe([second]);
 const third=frame(2);third.transform.position.x=2000;collector.observe([third]);
 const fourth=frame(3);fourth.groups=[{transform:{position:{x:0,y:0},scaleX:.1,scaleY:.1,rotate:0},childTimeOffset:0}];collector.observe([fourth]);
 const fifth=structuredClone(fourth);fifth.sceneTime=4;fifth.localTime=-3;fifth.groups[0].transform.rotate=40;collector.observe([fifth]);
 const sixth=frame(5);sixth.textBox.width=90;collector.observe([sixth]);
 const seventh=structuredClone(sixth);seventh.sceneTime=6;seventh.localTime=-1;collector.observe([seventh]);
 const evidence=collector.snapshot();expect(evidence.geometryCoverage).toBe("constant_record_pose_v1");
 expect(evidence.records).toHaveLength(6);expect(evidence.records.map(record=>record.sampleCount)).toEqual([1,1,1,1,1,2]);
 expect(evidence.records[1].transform.scaleX).toBe(.25);expect(evidence.records[2].transform.position.x).toBe(2000);
 expect(evidence.records[3].groups[0].transform.scaleX).toBe(.1);expect(evidence.records[4].groups[0].transform.rotate).toBe(40);
 expect(evidence.records[5].lastSceneTime).toBe(6);
 });
 test("a dropped changing pose cannot extend a prior retained record",()=>{
 const collector=new ExportTextMeasurementCollector(1);collector.observe([frame(0)]);
 const moving=frame(1);moving.transform.scaleY=.1;collector.observe([moving]);collector.observe([frame(2)]);
 const evidence=collector.snapshot();expect(evidence.records[0].sampleCount).toBe(1);expect(evidence.records[0].lastSceneTime).toBe(0);expect(evidence.droppedRecords).toBe(2);
 });
