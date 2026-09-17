package impostor.system;

import flixel.FlxGame;
import flixel.util.typeLimit.NextState.InitialState;

class FunkinGame extends FlxGame
{
    /**
     * Instantiate a new game object.
     * 
     * Yes this means you can have multiple HaxeFlixel games running at the same time (not recommended though).
     * @param gameWidth The width of your game in pixels. If `0`, the engine will use the `project.hxp` window width value.
     * @param gameHeight The height of your game in pixels. If `0`, the engine will use the `project.hxp` window height value.
     * @param initialState The `FlxState` the game will start in.
     * @param updateFramerate How frequently the game should update by default.
     * @param drawFramerate How frequently the game should be drawn by default.
     * @param startFullscreen Whether the game should start in fullscreen or not.
     */
    public function new(gameWidth:Int = 0, gameHeight:Int = 0, ?initialState:InitialState, updateFramerate:Int = 60, drawFramerate:Int = 60, startFullscreen:Bool = false) {
        super(gameWidth, gameHeight, initialState, updateFramerate, drawFramerate, true, startFullscreen);
    }

    override function update() {
        super.update();
    }
}