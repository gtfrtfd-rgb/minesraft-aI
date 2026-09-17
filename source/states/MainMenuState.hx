package states;

import flixel.FlxObject;
import flixel.addons.transition.FlxTransitionableState;
import flixel.effects.FlxFlicker;
import lime.app.Application;
import states.editors.MasterEditorMenu;
import options.OptionsState;

class MainMenuState extends MusicBeatState
{
	public static var psychEngineVersion:String = '0.7.3'; // This is also used for Discord RPC
	public static var curSelected:Int = 0;
	var menuItems:FlxTypedGroup<FlxSprite>;
	var optionShit:Array<String> = [
		'story_mode',
		'freeplay',
		'credits',
		'options'
	];

	override function create()
	{
		FlxG.camera.scroll.y = 0;
		#if MODS_ALLOWED
		Mods.pushGlobalMods();
		#end
		Mods.loadTopMod();

		#if DISCORD_ALLOWED
		// Updating Discord Rich Presence
		DiscordClient.changePresence("Looking at the main menu", null);
		#end

		transIn = FlxTransitionableState.defaultTransIn;
		transOut = FlxTransitionableState.defaultTransOut;
		persistentUpdate = persistentDraw = true;

		var bg:FlxSprite = new FlxSprite();
		bg.antialiasing = ClientPrefs.data.antialiasing;
		bg.makeGraphic(FlxG.width, FlxG.height, FlxColor.WHITE);
		add(bg);

		var char:FlxSprite = new FlxSprite().loadGraphic(Paths.image('mainmenu/bg'));
		char.antialiasing = false;
		char.updateHitbox();
		char.screenCenter();
		char.x += 200;
		add(char);

		menuItems = new FlxTypedGroup<FlxSprite>();
		add(menuItems);

		for (i in 0...optionShit.length)
		{
			var menuItem:FlxSprite = new FlxSprite(50, 350 + (i * 125));
			menuItem.frames = Paths.getSparrowAtlas('mainmenu/menu');
			menuItem.animation.addByPrefix('idle', optionShit[i], 24);
			menuItem.animation.addByPrefix('selected', "sel_" + optionShit[i], 24);
			menuItem.animation.play('idle');
			menuItem.antialiasing = false;
			menuItem.scale.set(0.7, 0.7);
			menuItems.add(menuItem);
			menuItem.updateHitbox();
			menuItem.alpha = 0.5;
		}
		menuItems.members[curSelected].alpha = 1;

		var logo:FlxSprite = new FlxSprite(50, 50).loadGraphic(Paths.image('title/logo'));
		logo.antialiasing = false;
		logo.scale.set(0.7, 0.7);
		logo.updateHitbox();
		add(logo);

		var fnfVer:FlxText = new FlxText(12, FlxG.height - 24, 0, "Lite Funkin' v1.0", 12);
		fnfVer.scrollFactor.set();
		fnfVer.setFormat(Paths.font("vcr.ttf"), 16, FlxColor.WHITE, LEFT, FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
		add(fnfVer);

		var psychVer:FlxText = new FlxText(0, FlxG.height - 24, 0, "Psych Engine v" + psychEngineVersion, 12);
		psychVer.scrollFactor.set();
		psychVer.setFormat(Paths.font("vcr.ttf"), 16, FlxColor.WHITE, LEFT, FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
		psychVer.x = FlxG.width - psychVer.width - 12;
		add(psychVer);

		changeItem(0);
		super.create();
	}

	var selectedSomethin:Bool = false;
	override function update(elapsed:Float)
	{
		if (FlxG.sound.music.volume < 0.8)
		{
			FlxG.sound.music.volume += 0.5 * elapsed;
			if (FreeplayState.vocals != null)
				FreeplayState.vocals.volume += 0.5 * elapsed;
		}

		if (!selectedSomethin)
		{
			if (controls.UI_UP_P)
				changeItem(-1);

			if (controls.UI_DOWN_P)
				changeItem(1);

			if (controls.BACK)
			{
				selectedSomethin = true;
				FlxG.sound.play(Paths.sound('cancelMenu'));
				FlxG.switchState(() -> new TitleState());
			}

			if (controls.ACCEPT)
			{
				FlxG.sound.play(Paths.sound('confirmMenu'));
				selectedSomethin = true;
				FlxFlicker.flicker(menuItems.members[curSelected], 1, 0.06, false, false, function(flick:FlxFlicker)
				{
					switch (optionShit[curSelected])
					{
						case 'story_mode':
							FlxG.switchState(() -> new StoryMenuState());
						case 'freeplay':
							FlxG.switchState(() -> new FreeplayState());
						case 'credits':
							FlxG.switchState(() -> new CreditsState());
						case 'options':
							FlxG.switchState(() -> new OptionsState());
							OptionsState.onPlayState = false;
							if (PlayState.SONG != null)
							{
								PlayState.SONG.arrowSkin = null;
								PlayState.SONG.splashSkin = null;
								PlayState.stageUI = 'normal';
							}
					}
				});

				for (i in 0...menuItems.members.length)
				{
					if (i == curSelected)
						continue;
					FlxTween.tween(menuItems.members[i], {alpha: 0}, 0.4, {
						ease: FlxEase.quadOut,
						onComplete: function(twn:FlxTween)
						{
							menuItems.members[i].kill();
						}
					});
				}
				
			}
		}

		super.update(elapsed);
	}

	function changeItem(huh:Int = 0)
	{
		if(huh != 0) FlxG.sound.play(Paths.sound('scrollMenu'));
		menuItems.members[curSelected].animation.play('idle');
		menuItems.members[curSelected].alpha = 0.5;
		menuItems.members[curSelected].updateHitbox();

		curSelected += huh;
		if (curSelected >= menuItems.length)
			curSelected = 0;
		if (curSelected < 0)
			curSelected = menuItems.length - 1;

		menuItems.members[curSelected].animation.play('selected');
		menuItems.members[curSelected].alpha = 1;
		menuItems.members[curSelected].centerOffsets();
	}
}
