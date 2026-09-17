package impostor.system;

import flixel.util.FlxSignal.FlxTypedSignal;

/**
 * The heart of all musical logic.
 */
final class Conductor
{
    /**
     * Gets triggered when a new measure is reached.
     */
    public static var onMeasureHit:FlxTypedSignal<Int->Void> = new FlxTypedSignal<Int->Void>();

    /**
     * Gets triggered when a new beat is reached.
     */
    public static var onBeatHit:FlxTypedSignal<Int->Void> = new FlxTypedSignal<Int->Void>();

    /**
     * Gets triggered when a new step is reached.
     */
    public static var onStepHit:FlxTypedSignal<Int->Void> = new FlxTypedSignal<Int->Void>();

    /**
     * Where the conductor is currently positioned at.
     */
    public static var songPosition(default, null):Float = 0;

    public static var curBPM(get, never):Float;

    public static var beatsPerMeasure(get, never):Int;

    public static var stepsPerBeat(get, never):Int;

    public static var curMeasure(default, null):Int = 0;

    public static var curMeasureFloat(default, null):Float = 0;

    public static var curBeat(default, null):Int = 0;

    public static var curBeatFloat(default, null):Float = 0;

    public static var curStep(default, null):Int = 0;

    public static var curStepFloat(default, null):Float = 0;

    public static var measureLengthMs(get, never):Float;

    public static var beatLengthMs(get, never):Float;

    public static var stepLengthMs(get, never):Float;

    public static var offset:Float = 0;

    /**
     * The list of BPM Changes the Conductor has configured and ready to execute.
     */
    static var bpmChanges(default, null):Array<BPMData> = [];

    /**
     * The current BPM Change being used.
     */
    static var curBPMChange(get, never):Null<BPMData>;

    /**
     * The current BPM Change indexed from `bpmChanges`.
     */
    static var curBPMChangeIndex(default, null):Int = 0;

    static var conductorElapsed:Float = 0;

    /**
     * Whether the Conductor updates or not.
     */
    static var _paused:Bool = true;

    /**
     * Whether the Conductor updates alongside the global `FlxSound` class or not.
     */
    static var _standalone:Bool = false;

    /**
     * Starts and sets up the Conductor for global use.
     */
    @:allow(impostor.InitState)
    static function init() {
        FlxG.signals.preUpdate.add(update);
    }

    public static function start(bpm:Float = 100, standalone:Bool = false, beatsPerMeasure:Int = 4, stepsPerBeat:Int = 4) {
        conductorElapsed = songPosition = curMeasureFloat = curBeatFloat = curStepFloat = curBPMChangeIndex = 0;
        curMeasure = curBeat = curStep = -1;
        resume();

        bpmChanges = [{
            time: 0,
            bpm: bpm,
            beatsPerMeasure: beatsPerMeasure,
            stepsPerBeat: stepsPerBeat
        }];

        _standalone = standalone;
    }

    public static function reset() {
        conductorElapsed = songPosition = curMeasureFloat = curBeatFloat = curStepFloat = curBPMChangeIndex = 0;
        curMeasure = curBeat = curStep = -1;
        pause();

        bpmChanges = [];

        onMeasureHit.removeAll();
        onBeatHit.removeAll();
        onStepHit.removeAll();
    }

    public static function pause()
    {
        _paused = true;
    }

    public static function resume()
    {
        _paused = false;
    }

    static function update() {
        if (_paused) return;

        if (_standalone) conductorElapsed += FlxG.elapsed;

        var curSongTime:Float = _standalone ? conductorElapsed : (FlxG.sound.music != null ? FlxG.sound.music.time : 0);
        var curSongLength:Float = _standalone ? Math.POSITIVE_INFINITY : (FlxG.sound.music != null ? FlxG.sound.music.length : 0);

        var oldMeasure:Int = curMeasure;
        var oldBeat:Int = curBeat;
        var oldStep:Int = curStep;

        if (FlxG.sound.music != null && FlxG.sound.music.playing)
        {
            songPosition = FlxMath.bound(Math.min(offset, 0), curSongTime, curSongLength);
            conductorElapsed += FlxG.elapsed * 1000 * FlxG.sound.music.pitch;
        }

        curStepFloat = FlxMath.roundDecimal((curSongTime / stepLengthMs), 4);
        curBeatFloat = curStepFloat / stepsPerBeat;
        curMeasureFloat = curBeatFloat / beatsPerMeasure;

        curStep = Math.floor(curStepFloat);
        curBeat = Math.floor(curBeatFloat);
        curMeasure = Math.floor(curMeasureFloat);

        if (curStep != oldStep) onStepHit.dispatch(curStep);
        if (curBeat != oldBeat) onBeatHit.dispatch(curBeat);
        if (curMeasure != oldMeasure) onMeasureHit.dispatch(curMeasure);

        for (i in 0...bpmChanges.length)
        {
            if (songPosition >= bpmChanges[i].time) curBPMChangeIndex = i;
            if (songPosition < bpmChanges[i].time) break;
        }
    }

    static function get_curBPMChange():BPMData
    {
        return bpmChanges[curBPMChangeIndex];
    }

    static function get_curBPM():Float
    {
        return curBPMChange.bpm;
    }

    static function get_beatsPerMeasure():Int
    {
        return curBPMChange.beatsPerMeasure;
    }

    static function get_stepsPerBeat():Int
    {
        return curBPMChange.stepsPerBeat;
    }

    static function get_measureLengthMs():Float
    {
        return beatLengthMs * beatsPerMeasure;
    }

    static function get_beatLengthMs():Float
    {
        return (60 / curBPM) * 1000;
    }

    static function get_stepLengthMs():Float
    {
        return beatLengthMs / stepsPerBeat;
    }
}

typedef BPMData =
{
    var time:Float;

    var bpm:Float;

    var beatsPerMeasure:Int;

    var stepsPerBeat:Int;
}