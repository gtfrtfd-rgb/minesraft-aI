package impostor.sound;

import flixel.sound.FlxSound;
import flixel.system.FlxAssets.FlxSoundAsset;
import openfl.media.Sound;

class FunkinSound extends FlxSound
{
    public static function playMusic(musicAsset:FlxSoundAsset, ?volume:Float, ?params:MusicParams)
    {
        if (musicAsset == null) return;

        var music:FunkinSound = new FunkinSound().loadStreamed(musicAsset, true);
        music.persist = true;
        music.volume = volume ?? 1;

        if (FlxG.sound.music != null)
        {
            FlxG.sound.music.destroy();
        }

        FlxG.sound.music = music;
        music.play();

        if (params != null)
        {
            Conductor.start(params.bpm);
        }
    }

    public static function pauseMusic()
    {
        if (FlxG.sound.music != null)
        {
            FlxG.sound.music.pause();
            Conductor.pause();
        }
    }

    public static function resumeMusic()
    {
        if (FlxG.sound.music != null)
        {
            FlxG.sound.music.resume();
            Conductor.resume();
        }
    }

    public static function stopMusic()
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

    public function loadSound(soundAsset:FlxSoundAsset, looped:Bool = false, autoDestroy:Bool = true, ?onComplete:Void->Void):FunkinSound
    {
        if (soundAsset == null) return this;

        cleanup(true);

        if (Std.isOfType(soundAsset, Sound))
        {
            _sound = soundAsset;
        }
        else if (Std.isOfType(soundAsset, String))
        {
            if (Assets.exists(soundAsset, SOUND))
            {
                _sound = Assets.getMusic(soundAsset);
            }
        }

        return cast init(looped, autoDestroy, onComplete);
    }

    public function loadStreamed(musicAsset:FlxSoundAsset, looped:Bool = true, autoDestroy:Bool = false, ?onComplete:Void->Void):FunkinSound
    {
        if (musicAsset == null) return this;

        cleanup(true);

        if (Std.isOfType(musicAsset, Sound))
        {
            _sound = musicAsset;
        }
        else if (Std.isOfType(musicAsset, String))
        {
            if (Assets.exists(musicAsset, MUSIC))
            {
                _sound = Assets.getMusic(musicAsset);
            }
        }

        return cast init(looped, autoDestroy, onComplete);
    }
}

typedef MusicParams =
{
    var bpm:Float;
    var ?stepsPerBeat:Int;
    var ?beatsPerMeasure:Int;
}