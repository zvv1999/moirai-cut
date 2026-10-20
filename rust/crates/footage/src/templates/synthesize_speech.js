ObjC.import("AppKit");

function run(args) {
    if (args[0] === "voices") {
        return JSON.stringify(ObjC.deepUnwrap($.NSSpeechSynthesizer.availableVoices).map(function (id) {
            var attributes = ObjC.deepUnwrap($.NSSpeechSynthesizer.attributesForVoice(id));
            return { id: id, name: attributes.VoiceName, locale: attributes.VoiceLocaleIdentifier,
                version: String(attributes.VoiceVersion || "unknown") };
        }));
    }
    var text = $.NSString.stringWithContentsOfFileEncodingError(args[0], $.NSUTF8StringEncoding, null);
    if (!text) throw new Error("Cannot read speech request");
    var request = JSON.parse(ObjC.unwrap(text));
    var synth = $.NSSpeechSynthesizer.alloc.initWithVoice(request.voiceId);
    if (!synth) throw new Error("Voice is unavailable");
    synth.rate = request.speakingRate;
    if (!synth.startSpeakingStringToURL(request.text, $.NSURL.fileURLWithPath(args[1]))) {
        throw new Error("Speech synthesis failed to start");
    }
    while (synth.isSpeaking) {
        $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
    }
    return JSON.stringify({ completed: true });
}
