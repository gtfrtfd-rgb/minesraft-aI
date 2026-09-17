package impostor.ui;

import flixel.addons.transition.FlxTransitionableState;

class MusicBeatState extends FlxTransitionableState
{
    public var curMeasure(get, never):Int;

    public var curBeat(get, never):Int;

    public var curStep(get, never):Int;

    public function new()
    {
        super();

        Conductor.onMeasureHit.add(measureHit);
        Conductor.onBeatHit.add(beatHit);
        Conductor.onStepHit.add(stepHit);
    }

    override public function destroy() {
        super.destroy();

        Conductor.onMeasureHit.remove(measureHit);
        Conductor.onBeatHit.remove(beatHit);
        Conductor.onStepHit.remove(stepHit);
    }

    public function measureHit(curMeasure:Int) {}

    public function beatHit(curBeat:Int) {}

    public function stepHit(curStep:Int) {}

    function get_curMeasure():Int
    {
        return Conductor.curMeasure;
    }

    function get_curBeat():Int
    {
        return Conductor.curBeat;
    }

    function get_curStep():Int
    {
        return Conductor.curStep;
    }
}