package impostor.play;

import flixel.text.FlxText;

class PlayState extends MusicBeatState
{
	override public function create()
	{
		super.create();

		FunkinSound.playMusic(Paths.music('mainMenu'), 1, {bpm: 102});

		DiscordClient.changePresence({
			state: "testing source",
			details: "Source Port"
		});

		var textTestLol:FlxText = new FlxText(4, 30, FlxG.width, "This is a text to test if this shit actually gets loaded, also hi", 36);
		add(textTestLol);
	}

	override public function update(elapsed:Float)
	{
		super.update(elapsed);
	}
}
