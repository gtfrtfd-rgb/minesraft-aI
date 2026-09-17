package impostor;

class Paths
{
    public static function getPath(path:String, ?library:String):String
    {
        return library != null ? '$library:assets/$library/$path' : 'assets/$path';
    }

    public static function image(path:String, ?library:String)
    {
        return getPath('images/$path.png', library);
    }

    public static function sound(path:String, ?library:String)
    {
        return getPath('sounds/$path.ogg', library);
    }

    public static function music(path:String, ?library:String)
    {
        return getPath('music/$path.ogg', library);
    }
}