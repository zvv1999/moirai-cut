import { z } from "zod";

/**
 * The wire schema for the edit vocabulary.
 *
 * This mirrors `apps/web/src/agent/operations.ts`, which is the real registry —
 * that file decides what can execute, this one only decides what an agent is
 * allowed to *ask* for. Two copies is a drift risk, so `__tests__/drift.test.mjs`
 * fails the build if the registry grows an operation this schema does not know.
 * Keeping the union explicit (rather than accepting any object) is what lets an
 * agent see argument names and get a useful error before a round trip.
 *
 * All times are SECONDS. The editor stores integer ticks at 120_000/second, and
 * a caller that reads a tick count and writes back seconds is wrong by five
 * orders of magnitude with nothing to catch it — so ticks never appear on the
 * wire at all.
 */

const trackType = z
  .enum(["video", "audio", "text", "graphic", "effect"])
  .describe("Track kind, as used by the editor's timeline model.");

const trackId = z.string().min(1).describe("Track id from get_state.");
const elementId = z.string().min(1).describe("Element id from get_state.");

const elementRef = z
  .object({ trackId, elementId })
  .describe("Addresses one clip. Both halves are required — the element id alone is not enough.");

const seconds = (what) => z.number().finite().nonnegative().describe(what);

const elementDraft = z
  .object({
    type: z.enum(["video", "image", "text", "audio", "sticker", "graphic", "effect"]),
    name: z.string().min(1),
    startTimeSeconds: seconds("Where the clip starts on the timeline. Required — the editor does not default it."),
    durationSeconds: z
      .number()
      .finite()
      .positive()
      .optional()
      .describe("Visible span on the timeline. Defaults to 5s. Must be > 0."),
    trimStartSeconds: seconds("Trimmed off the head of the source.").optional(),
    trimEndSeconds: seconds("Trimmed off the tail of the source.").optional(),
    params: z
      .record(z.union([z.number(), z.string(), z.boolean()]))
      .optional()
      .describe('Built-in element params. Text elements REQUIRE params.content.'),
    mediaId: z.string().min(1).optional().describe("Required for video/image/audio. From get_state().media."),
    stickerId: z.string().min(1).optional().describe("Required for sticker."),
    definitionId: z
      .string()
      .min(1)
      .optional()
      .describe("Required for graphic: rectangle | ellipse | polygon | star."),
    hidden: z.boolean().optional().describe("Visual elements only; ignored for audio."),
    effectType: z
      .enum(["blur"])
      .optional()
      .describe("Required for an effect element (an adjustment layer on an effect track)."),
    sourceDurationSeconds: z
      .number()
      .finite()
      .positive()
      .optional()
      .describe("Length of the underlying media. Filled in automatically from mediaId; only supply it if the asset is not in the library."),
  })
  .describe("A clip to create.");

export const OperationSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("track.add"),
        trackType,
        index: z.number().int().nonnegative().optional(),
      })
      .describe(
        "Add an empty track. NOTE: the editor prunes element-less tracks immediately, so this ALWAYS reports noEffect:true on its own. Use element.insert, which creates a track when needed.",
      ),
    z.object({ type: z.literal("track.remove"), trackId }),
    z.object({ type: z.literal("track.toggleMute"), trackId }),
    z.object({ type: z.literal("track.toggleVisibility"), trackId }),
    z.object({
      type: z.literal("scene.rename"),
      sceneId: z.string().min(1),
      newName: z.string().min(1),
    }),

    z
      .object({
        type: z.literal("element.insert"),
        element: elementDraft,
        trackId: trackId
          .optional()
          .describe("Omit to let the editor pick or create a compatible track."),
      })
      .describe("Add a clip to the timeline."),
    z.object({ type: z.literal("element.delete"), elements: z.array(elementRef).min(1) }),
    z
      .object({
        type: z.literal("element.move"),
        moves: z
          .array(
            z.object({
              trackId,
              elementId,
              targetTrackId: trackId.optional().describe("Omit to stay on the same track."),
              startTimeSeconds: seconds("New start position. Written directly, unlike element.trim's."),
            }),
          )
          .min(1),
      })
      .describe("Reposition clips, optionally onto another track."),
    z
      .object({
        type: z.literal("element.split"),
        elements: z.array(elementRef).min(1),
        splitTimeSeconds: seconds("Timeline position to cut at."),
        retainSide: z.enum(["both", "left", "right"]).optional(),
      })
      .describe("Cut clips at a timeline position."),
    z
      .object({
        type: z.literal("element.trim"),
        elements: z
          .array(
            z.object({
              trackId,
              elementId,
              startTimeSeconds: seconds("New start.").optional(),
              durationSeconds: z.number().finite().positive().optional(),
              trimStartSeconds: seconds("New head trim.").optional(),
              trimEndSeconds: seconds("New tail trim.").optional(),
            }),
          )
          .min(1),
      })
      .describe(
        "Change clip timing. Only the fields you name are touched; at least one is required. trimStart + duration + trimEnd may not exceed the source media length. NOTE: on the main track the editor pins the earliest clip to 0, so startTimeSeconds may be overridden — use element.move, which writes the position directly.",
      ),
    z.object({
      type: z.literal("element.rename"),
      elements: z.array(z.object({ trackId, elementId, name: z.string().min(1) })).min(1),
    }),
    z.object({ type: z.literal("element.duplicate"), elements: z.array(elementRef).min(1) }),

    z
      .object({
        type: z.literal("element.addEffect"),
        trackId,
        elementId,
        effectType: z.enum(["blur"]).describe("Effect id from the registry."),
      })
      .describe("Attach an effect to a visual clip. Read it back from get_state to get its id."),
    z.object({
      type: z.literal("element.removeEffect"),
      trackId,
      elementId,
      effectId: z.string().min(1).describe("From the clip's effects[] in get_state."),
    }),
    z.object({
      type: z.literal("element.toggleEffect"),
      trackId,
      elementId,
      effectId: z.string().min(1),
    }),
    z
      .object({
        type: z.literal("element.setEffectParams"),
        trackId,
        elementId,
        effectId: z.string().min(1),
        params: z
          .record(z.union([z.number(), z.string(), z.boolean()]))
          .describe("Merged over the current values. blur takes { intensity: 0..100 }."),
      })
      .describe("Tune an effect's parameters."),
    z
      .object({
        type: z.literal("element.upsertKeyframe"),
        trackId,
        elementId,
        propertyPath: z
          .enum([
            "transform.positionX", "transform.positionY",
            "transform.scaleX", "transform.scaleY", "transform.rotate",
            "opacity", "volume", "fontSize", "letterSpacing", "lineHeight",
            "background.cornerRadius", "background.paddingX", "background.paddingY",
            "background.offsetX", "background.offsetY",
          ])
          .describe("Which property to animate. Colour params are not available here — they need the open tab."),
        timeSeconds: seconds("Measured from the CLIP's own start, not the timeline. Clamped into the clip."),
        value: z
          .number()
          .finite()
          .describe("Snapped to the property's step and clamped to its range. NOTE: volume is DECIBELS (0 = unity, range -60..20), not a 0..1 gain."),
        interpolation: z
          .enum(["linear", "hold", "bezier"])
          .optional()
          .describe("How this key eases into the next. Omit to keep an existing key's easing."),
        keyframeId: z.string().min(1).optional().describe("Update a specific key. Omit to create one."),
      })
      .describe(
        "Add or move a keyframe. A SINGLE keyframe freezes the property for the whole clip — write both ends to get movement.",
      ),
    z.object({
      type: z.literal("element.retimeKeyframe"),
      trackId,
      elementId,
      propertyPath: z.string().min(1),
      keyframeId: z.string().min(1),
      timeSeconds: seconds("New position, from the CLIP's start. Clamped into the clip."),
    }),
    z
      .object({
        type: z.literal("element.setKeyframeCurve"),
        trackId,
        elementId,
        propertyPath: z.string().min(1),
        keyframeId: z.string().min(1),
        segmentToNext: z.enum(["step", "linear", "bezier"]).optional(),
        tangentMode: z.enum(["auto", "aligned", "broken", "flat"]).optional(),
      })
      .describe("Change how a keyframe eases into the next one. At least one field is required."),
    z
      .object({
        type: z.literal("element.upsertEffectKeyframe"),
        trackId,
        elementId,
        effectId: z.string().min(1).describe("From the clip's effects[] in get_state."),
        paramKey: z.string().min(1).describe('e.g. "intensity" for blur.'),
        timeSeconds: seconds("From the CLIP's start."),
        value: z.number().finite(),
        interpolation: z.enum(["linear", "hold", "bezier"]).optional(),
        keyframeId: z.string().min(1).optional(),
      })
      .describe("Animate an effect's parameter over time — a blur that ramps up, for instance."),
    z
      .object({
        type: z.literal("element.upsertMaskKeyframe"),
        trackId,
        elementId,
        maskId: z.string().min(1),
        paramKey: z.string().min(1).describe('e.g. "feather", "centerX", "width", "rotation".'),
        timeSeconds: seconds("From the CLIP's start."),
        value: z.number().finite().describe("Geometry is normalised: width 0.6 = 60% of the element."),
        interpolation: z.enum(["linear", "hold", "bezier"]).optional(),
        keyframeId: z.string().min(1).optional(),
      })
      .describe("Animate a mask parameter over time — a reveal, a moving spotlight, a softening edge."),
    z.object({
      type: z.literal("element.removeEffectKeyframe"),
      trackId,
      elementId,
      effectId: z.string().min(1),
      paramKey: z.string().min(1),
      keyframeId: z.string().min(1),
    }),
    z
      .object({ type: z.literal("element.toggleSourceAudio"), trackId, elementId })
      .describe(
        "Split a video clip's own audio onto its own audio track, or re-attach it. Re-attaching only flips the flag — it does not delete an audio clip you may have edited.",
      ),
    z
      .object({
        type: z.literal("element.addMask"),
        trackId,
        elementId,
        maskType: z.enum([
          "rectangle", "ellipse", "heart", "diamond", "star",
          "cinematic-bars", "split", "text", "freeform",
        ]),
        params: z
          .record(z.any())
          .optional()
          .describe(
            "Geometry is NORMALISED, not pixels: centerX/centerY are offsets from the element's centre and width/height are fractions of its size (0.6 = 60%). Defaults to a centred 60% box. A text mask requires params.content; a freeform mask requires params.path.",
          ),
      })
      .describe("Add a mask to a visual clip."),
    z
      .object({
        type: z.literal("element.setMaskParams"),
        trackId,
        elementId,
        maskId: z.string().min(1),
        params: z.record(z.any()),
      })
      .describe("Tune a mask. Merged over the current values; unknown keys are refused."),
    z
      .object({ type: z.literal("element.removeMask"), trackId, elementId, maskId: z.string().min(1) })
      .describe("Remove a mask. Mask ids come from the clip's masks[] in get_state."),
    z.object({
      type: z.literal("element.toggleMaskInverted"),
      trackId,
      elementId,
      maskId: z.string().min(1),
    }),
    z
      .object({
        type: z.literal("element.deleteMaskPoints"),
        trackId,
        elementId,
        maskId: z.string().min(1),
        pointIds: z.array(z.string().min(1)).min(1),
      })
      .describe("Freeform masks only. Point ids come from the mask's pointIds in get_state."),
    z
      .object({ type: z.literal("scene.create"), name: z.string().min(1) })
      .describe("Add a scene. Never the main scene — a project has exactly one."),
    z
      .object({ type: z.literal("scene.delete"), sceneId: z.string().min(1) })
      .describe("Delete a scene. The main scene cannot be deleted."),
    z
      .object({ type: z.literal("bookmark.toggle"), timeSeconds: seconds("Timeline position.") })
      .describe("Add a bookmark at this time, or remove the one already there."),
    z.object({ type: z.literal("bookmark.remove"), timeSeconds: seconds("Timeline position.") }),
    z.object({
      type: z.literal("bookmark.move"),
      fromSeconds: seconds("Where the bookmark is now."),
      toSeconds: seconds("Where it should go."),
    }),
    z
      .object({
        type: z.literal("bookmark.update"),
        timeSeconds: seconds("Which bookmark, by its position."),
        note: z.string().optional(),
        color: z.string().optional(),
        durationSeconds: seconds("Turns the marker into a range.").optional(),
      })
      .describe("Bookmarks are addressed by TIME, not by id. At least one field is required."),
    z
      .object({
        type: z.literal("project.updateSettings"),
        fps: z
          .object({ numerator: z.number().int().positive(), denominator: z.number().int().positive() })
          .optional()
          .describe("Exact rational — 29.97 is 30000/1001."),
        canvasSize: z
          .object({ width: z.number().int().positive(), height: z.number().int().positive() })
          .optional(),
        backgroundColor: z.string().optional().describe('Hex, e.g. "#000000".'),
      })
      .describe("Change project-wide settings. Only the fields you name are touched."),
    z.object({
      type: z.literal("element.removeKeyframe"),
      trackId,
      elementId,
      propertyPath: z.string().min(1),
      keyframeId: z.string().min(1),
      valueAtPlayhead: z
        .number()
        .finite()
        .nullable()
        .optional()
        .describe("Written into the clip's static params when the LAST keyframe is removed, so its look is preserved."),
    }),
    z.object({
      type: z.literal("element.reorderEffect"),
      trackId,
      elementId,
      fromIndex: z.number().int().nonnegative(),
      toIndex: z.number().int().nonnegative(),
    }),
  ])
  .describe("A single serializable edit. Call list_operations for what this build supports.");

/** Operation types this schema accepts — compared against the page registry. */
export const SCHEMA_OPERATION_TYPES = [
  "track.add",
  "track.remove",
  "track.toggleMute",
  "track.toggleVisibility",
  "scene.rename",
  "element.insert",
  "element.delete",
  "element.move",
  "element.split",
  "element.trim",
  "element.rename",
  "element.duplicate",
  "element.addEffect",
  "element.removeEffect",
  "element.toggleEffect",
  "element.setEffectParams",
  "element.reorderEffect",
  "element.upsertKeyframe",
  "element.removeKeyframe",
  "element.retimeKeyframe",
  "element.setKeyframeCurve",
  "element.upsertEffectKeyframe",
  "element.upsertMaskKeyframe",
  "element.removeEffectKeyframe",
  "element.toggleSourceAudio",
  "element.addMask",
  "element.setMaskParams",
  "element.removeMask",
  "element.toggleMaskInverted",
  "element.deleteMaskPoints",
  "scene.create",
  "scene.delete",
  "bookmark.toggle",
  "bookmark.remove",
  "bookmark.move",
  "bookmark.update",
  "project.updateSettings",
];
