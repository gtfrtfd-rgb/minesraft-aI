package impostor;

import flixel.FlxSprite;
import flixel.FlxState;
import flixel.addons.transition.FlxTransitionableState;
import flixel.util.FlxDestroyUtil;
import impostor.play.PlayState;

class InitState extends FlxState
{
	override public function create():Void
	{
		super.create();

		// Set default sprite antialiasing
		FlxSprite.defaultAntialiasing = false;

		// Initialize core systems
		Conductor.init();
		DiscordClient.init();

		// Enable system cursor on desktop platforms
		#if FLX_MOUSE
		FlxG.mouse.useSystemCursor = true;
		#end

		startGame();
	}

	function startGame():Void
	{
		// Skip transitions for faster startup
		FlxTransitionableState.skipNextTransIn = true;
		FlxTransitionableState.skipNextTransOut = true;

		FlxG.switchState(new PlayState());
	}
}