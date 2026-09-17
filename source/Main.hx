package;

import flixel.FlxGame;
import impostor.InitState;
import openfl.display.FPS;
import openfl.display.Sprite;

class Main extends Sprite
{
	public static var fpsCounter:FPS;

	public function new()
	{
		super();
		addChild(new FlxGame(0, 0, InitState, 60, 60, true, false));
		fpsCounter = new FPS(10, 3, 0xFFFFFFFF);
		addChild(fpsCounter);
	}
}
