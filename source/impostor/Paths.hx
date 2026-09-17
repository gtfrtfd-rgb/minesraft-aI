package impostor;

/**
 * Utility class for managing asset paths.
 * Provides standardized methods for accessing images, sounds, and music.
 */
final class Paths
{
	/**
	 * Gets the full path for an asset.
	 * @param path The relative path to the asset
	 * @param library Optional library name for asset grouping
	 * @return The complete asset path
	 */
	public static function getPath(path:String, ?library:String):String
	{
		return library != null ? '$library:assets/$library/$path' : 'assets/$path';
	}

	/**
	 * Gets the path for an image asset.
	 * @param path The image name (without extension)
	 * @param library Optional library name
	 * @return The complete image path with .png extension
	 */
	public static function image(path:String, ?library:String):String
	{
		return getPath('images/$path.png', library);
	}

	/**
	 * Gets the path for a sound effect asset.
	 * @param path The sound name (without extension)
	 * @param library Optional library name
	 * @return The complete sound path with .ogg extension
	 */
	public static function sound(path:String, ?library:String):String
	{
		return getPath('sounds/$path.ogg', library);
	}

	/**
	 * Gets the path for a music asset.
	 * @param path The music name (without extension)
	 * @param library Optional library name
	 * @return The complete music path with .ogg extension
	 */
	public static function music(path:String, ?library:String):String
	{
		return getPath('music/$path.ogg', library);
	}
}