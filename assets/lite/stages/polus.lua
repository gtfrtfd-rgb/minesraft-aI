local isSongSM = false
function onCreate()
    if songName == 'sussus-moongus' then isSongSM = true; end
    if isSongSM then
    	setProperty('defaultCamZoom', 0.65);
    	setProperty('camGame.zoom', 0.65);
    end

    if isSongSM then
    runHaxeCode([[
	import flixel.addons.display.FlxBackdrop;
	var spaceInf:FlxBackdrop = new FlxBackdrop(Paths.image("bg/polus/spaceInf"));
	spaceInf.setPosition(-1460, -1200);
	spaceInf.scale.set(2.2, 2.2);
	addBehindGF(spaceInf);
    ]]);
    end

    makeLuaSprite("space", "bg/polus/space", -1460, -1200)
    scaleObject("space", 2.2, 2.2)
    setProperty("space.antialiasing", false)
    if isSongSM then
    	setScrollFactor("space", 1, 1.3);
    	setProperty("space.y", -4000)
    end
    addLuaSprite("space")

    makeLuaSprite("ship", "bg/polus/ship", -1800, -2200)
    scaleObject("ship", 1, 1)
    setProperty("ship.antialiasing", false)
    setProperty("ship.velocity.x", 100);
    setProperty("ship.velocity.y", 20);
    addLuaSprite("ship")

    makeLuaSprite("pbg", "bg/polus/BG", -1460, -1200)
    scaleObject("pbg", 2.2, 2.2)
    setProperty("pbg.antialiasing", false)
    if songName ~= 'meltdown' then addLuaSprite("pbg") end

    makeLuaSprite("pbgC", "bg/polus/BGbutwithCrew", -1460, -1200)
    scaleObject("pbgC", 2.2, 2.2)
    setProperty("pbgC.antialiasing", false)
    if songName == 'meltdown' then addLuaSprite("pbgC") end

    makeLuaSprite('whiteThing', '', 0, 0);
    makeGraphic('whiteThing', 2000, 2000, 'FFFFFF')
    if isSongSM then addLuaSprite('whiteThing', false); end
    setProperty('whiteThing.alpha', 1)
    setObjectCamera('whiteThing', 'camHUD');
end

function onStepHit()
	if isSongSM and curStep >= 0 and curStep <= 64 then
		doTweenAlpha('tweenAlpha', 'whiteThing', 0, 8);
		doTweenZoom('tweenZoom', 'camGame', 0.55, 8);
	end
end

function onUpdatePost()
	if isSongSM and curStep >= 0 and curStep < 128 then
		setProperty('camFollow.x', 350);
		setProperty('camFollow.y', -2100);
	end
end