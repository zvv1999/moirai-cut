import type { FrameTextMeasurement } from "./text-measurements";

export type TextMeasurementRecord = FrameTextMeasurement & {
  lastSceneTime: number;
  lastLocalTime: number;
  sampleCount: number;
};
export type ExportTextMeasurements = {
  version: 1;
  status: "sampled";
  /** Missing on legacy records, whose pose describes the first observation only. */
  geometryCoverage?: "constant_record_pose_v1";
  producer: "production-scene-exporter";
  timebase: 120000;
  framesObserved: number;
  droppedRecords: number;
  records: TextMeasurementRecord[];
};

/** Facts from rendered frames, not a perceptual/readability verdict. A record
 * covers consecutive observations with exactly the same layout and full pose. */
export class ExportTextMeasurementCollector {
  private evidence: ExportTextMeasurements = {
    version: 1, status: "sampled", geometryCoverage: "constant_record_pose_v1", producer: "production-scene-exporter",
    timebase: 120000, framesObserved: 0, droppedRecords: 0, records: [],
  };
  private retainedCharacters = 0;
  private previous = new Map<string, {key:string; record:TextMeasurementRecord}>();
  constructor(private readonly limit = 2048) {}

  observe(measurements: FrameTextMeasurement[]): void {
    this.evidence.framesObserved++;
    const next = new Map<string, {key:string;record:TextMeasurementRecord}>();
    for (const measurement of measurements) {
      const source = JSON.stringify(measurement.source);
      const key = JSON.stringify({layout:measurement.layout,textBox:measurement.textBox,transform:measurement.transform,groups:measurement.groups});
      const serializedSize = JSON.stringify(measurement).length;
      const previous = this.previous.get(source);
      if (previous?.key === key) {
        previous.record.lastSceneTime = measurement.sceneTime;
        previous.record.lastLocalTime = measurement.localTime;
        previous.record.sampleCount++;
        next.set(source, previous);
      } else if (this.evidence.records.length < this.limit && key.length <= 32768 && source.length <= 4096 && measurement.groups.length <= 32 && this.retainedCharacters + serializedSize <= 524288) {
        const record = {...structuredClone(measurement),lastSceneTime:measurement.sceneTime,lastLocalTime:measurement.localTime,sampleCount:1};
        this.evidence.records.push(record);
        this.retainedCharacters += serializedSize;
        next.set(source, {key, record});
      } else {
        this.evidence.droppedRecords++;
      }
    }
    this.previous = next;
  }

  snapshot(): ExportTextMeasurements { return structuredClone(this.evidence); }
}
