package impostor.play;

import flixel.text.FlxText;

class PlayState extends MusicBeatState
{
	override public function create():Void
	{
		super.create();

		// Start background music with BPM settings
		FunkinSound.playMusic(Paths.music('mainMenu'), 1.0, {bpm: 102.0});

		// Update Discord rich presence
		DiscordClient.changePresence({
			state: "testing source",
			details: "Source Port"
		});

		// Debug text to verify game is loading
		var debugText:FlxText = new FlxText(4, 30, FlxG.width, "This is a text to test if this shit actually gets loaded, also hi", 36);
		add(debugText);
	}

	override public function update(elapsed:Float):Void
	{
		super.update(elapsed);
	}
}
