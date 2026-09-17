package substates;

import backend.WeekData;

import objects.Character;
import flixel.FlxObject;
import flixel.FlxSubState;

import states.StoryMenuState;
import states.FreeplayState;

class GameOverSubstate extends MusicBeatSubstate
{
	public var boyfriend:Character;
	var camFollow:FlxObject;
	public var camGameover:FlxCamera;
	var moveCamera:Bool = false;

	public static var characterName:String = 'bf';
	public static var deathSoundName:String = 'loss';

	public static var instance:GameOverSubstate;

	public static function resetVariables() {
		characterName = 'bf';
		deathSoundName = 'loss';

		var _song = PlayState.SONG;
		if(_song != null)
		{
			if(_song.gameOverChar != null && _song.gameOverChar.trim().length > 0) characterName = _song.gameOverChar;
			if(_song.gameOverSound != null && _song.gameOverSound.trim().length > 0) deathSoundName = _song.gameOverSound;
		}
	}

	var charX:Float = 0;
	var charY:Float = 0;
	var bfLose:FlxSprite;
	var bgDarkS:FlxSprite;
	override function create()
	{
		instance = this;
		Conductor.songPosition = 0;

		camGameover = new FlxCamera();
		camGameover.bgColor.alpha = 0;
		FlxG.cameras.add(camGameover, false);

		bgDarkS = new FlxSprite();
		bgDarkS.antialiasing = ClientPrefs.data.antialiasing;
		bgDarkS.makeGraphic(FlxG.width, FlxG.height, FlxColor.BLACK);
		bgDarkS.alpha = 0;
		bgDarkS.cameras = [camGameover];
		add(bgDarkS);

		bfLose = new FlxSprite().loadGraphic(Paths.image('ingame/gameover'));
		bfLose.antialiasing = ClientPrefs.data.antialiasing;
		bfLose.y -= bfLose.height;
		bfLose.cameras = [camGameover];
		add(bfLose);

		FlxG.sound.play(Paths.sound(deathSoundName));
		PlayState.instance.boyfriend.playAnim('firstDeath');

		camFollow = new FlxObject(0, 0, 1, 1);
		camFollow.setPosition(PlayState.instance.boyfriend.getGraphicMidpoint().x, PlayState.instance.boyfriend.getGraphicMidpoint().y);
		FlxG.camera.focusOn(new FlxPoint(FlxG.camera.scroll.x + (FlxG.camera.width / 2), FlxG.camera.scroll.y + (FlxG.camera.height / 2)));
		add(camFollow);
		
		FlxTween.tween(FlxG.camera, {zoom: FlxG.camera.zoom + 0.2}, 1, {ease: FlxEase.quadOut});

		PlayState.instance.setOnScripts('inGameOver', true);
		PlayState.instance.callOnScripts('onGameOverStart', []);

		super.create();
	}

	public var startedDeath:Bool = false;
	override function update(elapsed:Float)
	{
		super.update(elapsed);

		PlayState.instance.callOnScripts('onUpdate', [elapsed]);

		if (controls.ACCEPT)
		{
			endBullshit();
		}

		if (controls.BACK)
		{
			#if DISCORD_ALLOWED DiscordClient.resetClientID(); #end
			FlxG.sound.music.stop();
			PlayState.deathCounter = 0;
			PlayState.seenCutscene = false;
			PlayState.chartingMode = false;

			Mods.loadTopMod();
			if (PlayState.isStoryMode)
				FlxG.switchState(() -> new StoryMenuState());
			else
				FlxG.switchState(() -> new FreeplayState());

			FlxG.sound.playMusic(Paths.music('freakyMenu'));
			PlayState.instance.callOnScripts('onGameOverConfirm', [false]);
		}
		
		if (PlayState.instance.boyfriend.animation.curAnim != null)
		{
			if(PlayState.instance.boyfriend.animation.curAnim.name == 'firstDeath')
			{
				if(!moveCamera)
				{
					FlxG.camera.follow(camFollow, LOCKON, 0.6);
					moveCamera = true;
					moveItDown();
				}
			}
		}
		
		if (FlxG.sound.music.playing)
		{
			Conductor.songPosition = FlxG.sound.music.time;
		}
		PlayState.instance.callOnScripts('onUpdatePost', [elapsed]);
	}

	var isEnding:Bool = false;
	function endBullshit():Void
	{
		if (!isEnding)
		{
			isEnding = true;
			FlxG.sound.music.stop();
			new FlxTimer().start(0.7, function(tmr:FlxTimer)
			{
				camGameover.fade(FlxColor.BLACK, 2, false, function()
				{
					FlxG.resetState();
				});
			});
			PlayState.instance.callOnScripts('onGameOverConfirm', [true]);
		}
	}

	function moveItDown()
	{
		new FlxTimer().start(1.4, function(tmr:FlxTimer)
		{
			FlxG.sound.play(Paths.sound('gameOver'));
			FlxTween.tween(bfLose, {y: 0}, 1.1, {ease: FlxEase.smootherStepInOut});
			FlxTween.tween(bgDarkS, {alpha: 0.5}, 1.1, {ease: FlxEase.smootherStepInOut});
		});
	}

	override function destroy()
	{
		instance = null;
		super.destroy();
	}
}
