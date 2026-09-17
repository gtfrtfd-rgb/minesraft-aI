package impostor.ui;

import flixel.addons.transition.FlxTransitionableState;

/**
 * Base state class for music/beat synchronized game states.
 * Automatically handles Conductor event subscriptions and cleanup.
 */
class MusicBeatState extends FlxTransitionableState
{
	/** Current measure index from Conductor */
	public var curMeasure(get, never):Int;

	/** Current beat index from Conductor */
	public var curBeat(get, never):Int;

	/** Current step index from Conductor */
	public var curStep(get, never):Int;

	public function new()
	{
		super();

		// Subscribe to conductor events
		Conductor.onMeasureHit.add(measureHit);
		Conductor.onBeatHit.add(beatHit);
		Conductor.onStepHit.add(stepHit);
	}

	override public function destroy():Void
	{
		super.destroy();

		// Unsubscribe from conductor events to prevent memory leaks
		Conductor.onMeasureHit.remove(measureHit);
		Conductor.onBeatHit.remove(beatHit);
		Conductor.onStepHit.remove(stepHit);
	}

	/**
	 * Called when a new measure is hit.
	 * Override this in subclasses to handle measure changes.
	 * @param curMeasure The current measure index
	 */
	public function measureHit(curMeasure:Int):Void {}

	/**
	 * Called when a new beat is hit.
	 * Override this in subclasses to handle beat changes.
	 * @param curBeat The current beat index
	 */
	public function beatHit(curBeat:Int):Void {}

	/**
	 * Called when a new step is hit.
	 * Override this in subclasses to handle step changes.
	 * @param curStep The current step index
	 */
	public function stepHit(curStep:Int):Void {}

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