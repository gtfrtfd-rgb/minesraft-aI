package backend;

class CustomFadeTransition extends MusicBeatSubstate
{
	public static var finishCallback:Void->Void;

	var isTransIn:Bool = false;
	var duration:Float;

	static var whiteCircle:FlxSprite;
	static var bf:FlxSprite;

	public var camHUD:FlxCamera;
	public function new(duration:Float, isTransIn:Bool)
	{
		this.duration = duration;
		this.isTransIn = isTransIn;
		super();
	}

	override function create()
	{
		camHUD = new FlxCamera();
		camHUD.bgColor.alpha = 0;
		FlxG.cameras.add(camHUD, false);

		cameras = [FlxG.cameras.list[FlxG.cameras.list.length-1]];
		whiteCircle = new FlxSprite().loadGraphic(Paths.image('switchState'));
		whiteCircle.antialiasing = false;
		whiteCircle.updateHitbox();
		whiteCircle.screenCenter();
		whiteCircle.antialiasing = false;
		whiteCircle.cameras = [camHUD];
		add(whiteCircle);

		bf = new FlxSprite();
		bf.frames = Paths.getSparrowAtlas('runbfrun');
		bf.animation.addByPrefix('run', "run", 24, false);
		bf.animation.addByPrefix('stop', "stop", 24, false);
		bf.animation.addByPrefix('loopedStop', "loop-stop", 24, true);
		bf.animation.play('run');
		bf.antialiasing = false;
		bf.screenCenter(Y);
		bf.x -= bf.width;
		bf.scale.set(1.5, 1.5);
		bf.cameras = [camHUD];
		add(bf);

		if(!isTransIn) {
			bf.x -= bf.width;
			whiteCircle.scale.set(0, 0);
		}
		else {
			bf.x = (FlxG.width / 2) - (bf.width / 2);
			whiteCircle.scale.set(7, 7);
		}

		if(!isTransIn)
		{
			FlxTween.tween(bf, {x: (FlxG.width / 2) - (bf.width / 2)}, duration, {ease: FlxEase.quadOut});
			FlxTween.tween(whiteCircle.scale, {x: 7, y: 7}, duration, {ease: FlxEase.quadOut, onComplete: function (twn:FlxTween)
				{
					if(finishCallback != null) finishCallback();
					finishCallback = null;
				}
			});
		} else {
			FlxTween.tween(bf, {x: FlxG.width}, duration, {ease: FlxEase.quadIn});
			FlxTween.tween(whiteCircle.scale, {x: 0.001, y: 0.001}, duration, {ease: FlxEase.quadIn, onComplete: function (twn:FlxTween)
				{
					close();
					if(finishCallback != null) finishCallback();
					finishCallback = null;
				}
			});			
		}

		super.create();
	}

	override function update(elapsed:Float) {
		super.update(elapsed);
	}
}