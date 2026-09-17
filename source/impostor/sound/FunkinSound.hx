package impostor.sound;

import flixel.sound.FlxSound;
import flixel.system.FlxAssets.FlxSoundAsset;
import openfl.media.Sound;

/**
 * Custom FlxSound class for handling music and sound effects.
 * Provides static methods for music control with automatic Conductor synchronization.
 */
class FunkinSound extends FlxSound
{
	/**
	 * Plays a music track with optional volume and BPM parameters.
	 * @param musicAsset The music asset to play (String path)
	 * @param volume Volume level (0.0 to 1.0, default: 1.0)
	 * @param params Optional music parameters including BPM
	 */
	public static function playMusic(musicAsset:String, ?volume:Float = 1.0, ?params:MusicParams):Void
	{
		if (musicAsset == null) return;

		var music:FunkinSound = new FunkinSound().loadStreamed(musicAsset, true);
		music.persist = true;
		music.volume = volume;

		if (FlxG.sound.music != null)
		{
			FlxG.sound.music.destroy();
		}

		FlxG.sound.music = music;
		music.play();

		if (params != null)
		{
			Conductor.start(params.bpm, false, params.beatsPerMeasure != null ? params.beatsPerMeasure : 4, params.stepsPerBeat != null ? params.stepsPerBeat : 4);
		}
	}

	/**
	 * Pauses the current music track and the Conductor.
	 */
	public static function pauseMusic():Void
	{
		if (FlxG.sound.music != null)
		{
			FlxG.sound.music.pause();
			Conductor.pause();
		}
	}

	/**
	 * Resumes the current music track and the Conductor.
	 */
	public static function resumeMusic():Void
	{
		if (FlxG.sound.music != null)
		{
			FlxG.sound.music.resume();
			Conductor.resume();
		}
	}

	/**
	 * Stops the current music track and pauses the Conductor.
	 */
	public static function stopMusic():Void
	{
		if (FlxG.sound.music != null)
		{
			FlxG.sound.music.stop();
			Conductor.pause();
		}
	}

	public function new()
	{
		super();
	}

	/**
	 * Loads a sound effect asset.
	 * @param soundAsset The sound asset to load (String path)
	 * @param looped Whether the sound should loop
	 * @param autoDestroy Whether to automatically destroy after playback
	 * @param onComplete Callback when sound finishes playing
	 * @return This FunkinSound instance
	 */
	public function loadSound(soundAsset:String, looped:Bool = false, autoDestroy:Bool = true, ?onComplete:Void->Void):FunkinSound
	{
		if (soundAsset == null) return this;

		cleanup(true);

		if (Assets.exists(soundAsset, SOUND))
		{
			_sound = Assets.getMusic(soundAsset);
		}

		return cast init(looped, autoDestroy, onComplete);
	}

	/**
	 * Loads a streamed music asset.
	 * @param musicAsset The music asset to load (String path)
	 * @param looped Whether the music should loop
	 * @return This FunkinSound instance
	 */
	public function loadStreamed(musicAsset:String, looped:Bool = true):FunkinSound
	{
		if (musicAsset == null) return this;

		cleanup(true);

		if (Assets.exists(musicAsset, MUSIC))
		{
			_sound = Assets.getMusic(musicAsset);
		}

		return cast init(looped, false, null);
	}
}

/**
 * Parameters for music playback configuration.
 */
typedef MusicParams =
{
	var bpm:Float;
	var ?stepsPerBeat:Int;
	var ?beatsPerMeasure:Int;
}