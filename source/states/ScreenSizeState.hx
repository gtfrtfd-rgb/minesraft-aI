package states;

import flixel.effects.FlxFlicker;
import lime.app.Application;
import flixel.addons.transition.FlxTransitionableState;

class ScreenSizeState extends MusicBeatState
{
    public static var curSelectedSize:Int = 0;

    public static var selectedScreenSize:String = "";

	public var sizeGrp:FlxTypedGroup<FlxText>;

    public var choose:FlxText;

    public var black:FlxSprite;

    public static var screenSizes:Array<Array<Dynamic>> = [
        [1200, 900, "1n9"],
        [960, 720, "9n7"]
    ];

    override function create()
    {
        FlxG.mouse.visible = true;
        persistentUpdate = persistentDraw = true;
        FlxTransitionableState.skipNextTransOut = true;
        Lib.application.window.resizable = false;

        choose = new FlxText(0, 75, FlxG.width, "Choose screen resolution", 60);
        choose.setFormat(Paths.font("vcr.ttf"), 60, FlxColor.WHITE, CENTER);
        choose.alpha = 0.0001;
        add(choose);

        FlxTween.tween(choose, {y: 100, alpha: 1}, 0.3, {ease: FlxEase.smootherStepInOut, startDelay: 0.4});

		sizeGrp = new FlxTypedGroup<FlxText>();
		add(sizeGrp);

        for(i in 0...screenSizes.length) {
            var txt:FlxText = new FlxText(0, 300, 0, '${screenSizes[i][0]}x${screenSizes[i][1]}', 28);
            txt.fieldWidth = txt.width;
            txt.setFormat(Paths.font("vcr.ttf"), 28, FlxColor.WHITE, CENTER);
            txt.alpha = 0.00001;
            txt.screenCenter(X);
            txt.ID = i;
            sizeGrp.add(txt);
            switch(screenSizes[i][2]) {
                case "1n9":
                    txt.x -= 225;
                case "9n7":
                    txt.x += 225;
            }

            FlxTween.tween(txt, {y: 325, alpha: 0.6}, 0.3, {ease: FlxEase.smootherStepInOut, startDelay: 1.2 + (i * 0.3), onComplete: function(_) {
                if(i == screenSizes.length - 1) selectedSomethin = false;
            }});
        }
	
        black = new FlxSprite();
		black.makeGraphic(FlxG.width, FlxG.height, FlxColor.BLACK);
        black.alpha = 0.00001;
		add(black);

        super.create();
        changeItem();
    }

	var selectedSomethin:Bool = true;
    override function update(elapsed:Float)
    {
        if (!selectedSomethin)
        {
            sizeGrp.forEach(function(spr:FlxSprite) {
                if(FlxG.mouse.overlaps(spr)) {
                    curSelectedSize = spr.ID;
                    if(FlxG.mouse.justPressed) {
                        selectedSize();
                    }
                }
            });

            if (controls.UI_LEFT_P)
				changeItem(-1);
			if (controls.UI_RIGHT_P)
				changeItem(1);

            sizeGrp.forEach(function(spr:FlxText) 
            {
                if(spr.ID == curSelectedSize) {
                    spr.scale.x = FlxMath.lerp(spr.scale.x, 1.125, FlxMath.bound(elapsed * 12, 0, 1));
                    spr.scale.y = FlxMath.lerp(spr.scale.y, 1.125, FlxMath.bound(elapsed * 12, 0, 1));
                    spr.alpha = FlxMath.lerp(spr.alpha, 1, FlxMath.bound(elapsed * 12, 0, 1));
                }
                else {
                    spr.scale.x = FlxMath.lerp(spr.scale.x, 1, FlxMath.bound(elapsed * 12, 0, 1));
                    spr.scale.y = FlxMath.lerp(spr.scale.y, 1, FlxMath.bound(elapsed * 12, 0, 1));
                    spr.alpha = FlxMath.lerp(spr.alpha, 0.6, FlxMath.bound(elapsed * 12, 0, 1));
                }
            });

            if (controls.ACCEPT)
            {
                selectedSomethin = true;
                FlxG.mouse.visible = false;
                FlxG.sound.play(Paths.sound('confirmMenu'));
                selectedSize();
            }
        }

        super.update(elapsed);
    }

    function selectedSize()
    {
        FlxTween.tween(choose, {alpha: 0.00001}, 0.3);
        FlxFlicker.flicker(sizeGrp.members[curSelectedSize], 1, 0.06, false, false, function(flick:FlxFlicker)
        {
            FlxG.mouse.visible = false;
            switch(screenSizes[curSelectedSize][2]) {
                case "1n9":
                    selectedScreenSize = "1200x900";
                case "9n7":
                    selectedScreenSize = "960x720";
            }
            resizeScreenC();
        });

        for (i in 0...sizeGrp.members.length)
        {
            if (i == curSelectedSize)
                continue;
            FlxTween.tween(sizeGrp.members[i], {alpha: 0}, 0.6, {
                ease: FlxEase.quadOut,
                onComplete: function(twn:FlxTween)
                {
                    sizeGrp.members[i].kill();
                }
            });
        }
    }

	function changeItem(huh:Int = 0)
	{
		if(huh != 0) FlxG.sound.play(Paths.sound('scrollMenu'));
		curSelectedSize += huh;
		if (curSelectedSize >= sizeGrp.length)
			curSelectedSize = 0;
		if (curSelectedSize < 0)
			curSelectedSize = sizeGrp.length - 1;
	}

    var windowRes:FlxPoint;
    var windowPos:FlxPoint;
    var startTime:Float;
    var windowTwn:FlxTween;
    function resizeScreenC() // i love you mario madness v2
    {
        FlxG.updateFramerate = 30;

        windowRes = FlxPoint.get(Lib.application.window.width, Lib.application.window.height);
        windowPos = CoolUtil.getCenterWindowPoint();
        startTime = Sys.time();
        
        windowTwn = FlxTween.tween(windowRes, {x: screenSizes[curSelectedSize][0], y: screenSizes[curSelectedSize][1]}, 0.3 * 4, {ease: FlxEase.circInOut, 
            onUpdate: (_) -> {
                FlxG.resizeWindow(Std.int(windowRes.x), Std.int(windowRes.y));
                CoolUtil.centerWindowOnPoint(windowPos);
                if ((Sys.time() - startTime) > 1.35) {
                    windowTwn.cancel();
                    completeWindowTwn();
                }
            }, 
            onComplete: function(twn:FlxTween)
            {
                completeWindowTwn();
            }
        });
    }

    function completeWindowTwn() {
		FlxG.updateFramerate = ClientPrefs.data.framerate;

		FlxG.resizeWindow(screenSizes[curSelectedSize][0], screenSizes[curSelectedSize][1]);
        FlxG.width = screenSizes[curSelectedSize][0];
        FlxG.height = screenSizes[curSelectedSize][1];
        FlxG.initialWidth = screenSizes[curSelectedSize][0];
        FlxG.initialHeight = screenSizes[curSelectedSize][1];
		FlxG.resizeGame(screenSizes[curSelectedSize][0], screenSizes[curSelectedSize][1]);
		CoolUtil.centerWindowOnPoint(windowPos);

		FlxG.switchState(() -> new TitleState());
	};
}