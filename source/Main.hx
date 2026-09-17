package;

import flixel.FlxGame;
import flixel.system.FlxPreloader;
import impostor.InitState;
import openfl.display.FPS;
import openfl.display.Sprite;
import openfl.Lib;

class Main extends Sprite
{
	public static var fpsCounter:FPS;

	public function new()
	{
		super();

		// Initialize the game with proper settings
		var game:FlxGame = new FlxGame(0, 0, InitState, 60, 60, true, false);
		addChild(game);

		// Setup FPS counter
		fpsCounter = new FPS(10, 3, 0xFFFFFFFF);
		addChild(fpsCounter);

		// Set window title if on desktop
		#if desktop
		Lib.current.stage.window.title = "VS IMPOSTOR Pixel";
		#end
	}
}
