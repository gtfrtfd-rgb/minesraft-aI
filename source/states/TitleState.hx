package states;

import backend.WeekData;
import backend.Highscore;
import flixel.util.FlxSave;
import flixel.input.keyboard.FlxKey;
import states.MainMenuState;

class TitleState extends MusicBeatState
{
	public static var muteKeys:Array<FlxKey> = [FlxKey.ZERO];
	public static var volumeDownKeys:Array<FlxKey> = [FlxKey.NUMPADMINUS, FlxKey.MINUS];
	public static var volumeUpKeys:Array<FlxKey> = [FlxKey.NUMPADPLUS, FlxKey.PLUS];

	public static var logo:FlxSprite;
	var titleStuff:FlxTypedGroup<FlxSprite>;
	override public function create():Void
	{
		persistentUpdate = persistentDraw = true;
		Lib.application.window.resizable = true;
		FlxG.mouse.visible = false;
		Highscore.load();

		if(FlxG.sound.music == null) {
			FlxG.sound.playMusic(Paths.music('freakyMenu'), 0);
			FlxG.sound.music.fadeIn(4, 0, 1);
		}
		Conductor.bpm = 102;

		var bg:FlxSprite = new FlxSprite();
		bg.antialiasing = false;
		bg.makeGraphic(FlxG.width, FlxG.height, FlxColor.WHITE);
		bg.scrollFactor.set(0, 0);
		add(bg);

		titleStuff = new FlxTypedGroup<FlxSprite>();
		add(titleStuff);

		var bf:FlxSprite = new FlxSprite().loadGraphic(Paths.image('title/bf'));
		bf.antialiasing = false;
		bf.screenCenter();
		bf.x -= 250;
		bf.y += 50;
		bf.updateHitbox();
		titleStuff.add(bf);

		var enter:FlxSprite = new FlxSprite().loadGraphic(Paths.image('title/press'));
		enter.antialiasing = false;
		enter.screenCenter();
		enter.y += 325;
		enter.updateHitbox();
		titleStuff.add(enter);

		logo = new FlxSprite(0, 125).loadGraphic(Paths.image('title/logo'));
		logo.offset.x = logo.offset.x / 2;
		logo.offset.y = logo.offset.y / 2;
		logo.x = FlxG.width - logo.width;
		logo.antialiasing = false;
		logo.scale.set(1, 1);
		titleStuff.add(logo);

		super.create();
		Paths.clearUnusedMemory();
	}

	var selected:Bool = false;
	override function update(elapsed:Float)
	{
		if (FlxG.sound.music != null)
			Conductor.songPosition = FlxG.sound.music.time;

		var mult:Float = FlxMath.lerp(1, logo.scale.x, Math.exp(-elapsed * 9 * 1));
		logo.scale.set(mult, mult);

		var pressedEnter:Bool = FlxG.keys.justPressed.ENTER;
		if(pressedEnter && !selected)
		{
			selected = true;
			FlxG.camera.flash(FlxColor.WHITE, 1);
			FlxG.sound.play(Paths.sound('confirmMenu'), 0.7);
			for(item in titleStuff.members)
			FlxTween.tween(item, {y: item.y + 1000}, 1.2, {ease: FlxEase.smootherStepInOut, startDelay: 0.02});
			new FlxTimer().start(1.3, function(tmr:FlxTimer)
			{
				FlxG.switchState(() -> new MainMenuState());
			});
		}

		super.update(elapsed);
	}

	override function beatHit()
	{
		logo.scale.set(1.05, 1.05);
		logo.updateHitbox();

		super.beatHit();
	}
}
