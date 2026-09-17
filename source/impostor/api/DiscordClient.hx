package impostor.api;

#if DISCORD_API
import hxdiscord_rpc.Discord;
import hxdiscord_rpc.Types;
import sys.thread.Thread;
#end

/**
 * Discord Rich Presence integration for the game.
 * Shows what the player is doing in their Discord status.
 */
class DiscordClient
{
	static final clientID:String = "1392684759658008758";

	/**
	 * Initializes the Discord RPC client.
	 * Should be called once at game startup.
	 */
	public static function init():Void
	{
		#if DISCORD_API
		var handlers:DiscordEventHandlers = new DiscordEventHandlers();
		handlers.ready = cpp.Function.fromStaticFunction(onReady);
		handlers.disconnected = cpp.Function.fromStaticFunction(onDisconnect);
		handlers.errored = cpp.Function.fromStaticFunction(onError);

		Discord.Initialize(clientID, cpp.RawPointer.addressOf(handlers), true, null);

		Thread.create(discordRPCUpdate);
		#end
	}

	#if DISCORD_API
	/**
	 * Background thread that keeps Discord RPC updated.
	 */
	static function discordRPCUpdate():Void
	{
		while (true)
		{
			#if DISCORD_DISABLE_IO_THREAD
			Discord.UpdateConnection();
			#end

			Discord.RunCallbacks();

			Sys.sleep(2.0);
		}
	}

	/**
	 * Called when successfully connected to Discord.
	 * @param request Pointer to Discord user data
	 */
	static function onReady(request:cpp.RawConstPointer<DiscordUser>):Void
	{
		trace('[DISCORD] Successfully connected to user "${request[0].username}"!');
	}

	/**
	 * Called when disconnected from Discord.
	 * @param error Error code
	 * @param message Error message
	 */
	static function onDisconnect(error:Int, message:cpp.ConstCharStar):Void
	{
		trace("[DISCORD] Disconnected from user");
	}

	/**
	 * Called when an error occurs with Discord RPC.
	 * @param error Error code
	 * @param message Error message
	 */
	static function onError(error:Int, message:cpp.ConstCharStar):Void
	{
		throw '[DISCORD] AN ERROR OCURRED! (Error code: $error | Message: ${cast(message, String)})';
	}
	#end

	/**
	 * Changes the Discord rich presence status.
	 * @param params The presence parameters (state, details, images, etc.)
	 */
	public static function changePresence(params:#if DISCORD_API DiscordRPCParams #else Dynamic #end):Void
	{
		#if DISCORD_API
		var presence:DiscordRichPresence = new DiscordRichPresence();

		presence.type = DiscordActivityType.DiscordActivityType_Playing;

		presence.state = (params.state != null) ? params.state : "";
		presence.details = (params.details != null) ? params.details : "";

		// The big image representing the game that appears on the RPC.
		// The text that appears when you hover over the RPC image.
		presence.largeImageText = "VS IMPOSTOR Pixel";
		// The key name of the image inside the RPC assets.
		presence.largeImageKey = (params.largeImageKey != null) ? params.largeImageKey : "mainhd";

		// A small icon that appears at the bottom right of the image of the RPC.
		// The text that appears when you hover over the RPC image.
		presence.smallImageText = (params.smallImageText != null) ? params.smallImageText : "";
		// The key name of the image inside the RPC assets.
		presence.smallImageKey = (params.smallImageKey != null) ? params.smallImageKey : "";

		Discord.UpdatePresence(cpp.RawConstPointer.addressOf(presence));
		#end
	}

	/**
	 * Clears the current Discord rich presence.
	 */
	public static function clearPresence():Void
	{
		#if DISCORD_API
		Discord.ClearPresence();
		#end
	}

	/**
	 * Shuts down the Discord RPC client.
	 * Should be called when closing the game.
	 */
	public static function shutdown():Void
	{
		#if DISCORD_API
		Discord.Shutdown();
		#end
	}
}

/**
 * Parameters for Discord Rich Presence configuration.
 */
typedef DiscordRPCParams =
{
	/**
	 * The current state the player is at.
	 */
	var state:String;

	/**
	 * Details about the state.
	 */
	var details:String;

	/**
	 * What the user is doing.
	 */
	var ?activity:#if DISCORD_API DiscordActivityType #else Dynamic #end;

	/**
	 * The image to display in the Discord RPC.
	 * MUST BE THE KEY NAME OF THE IMAGE INSIDE THE RPC ASSETS!!!
	 */
	var ?largeImageKey:String;

	/**
	 * The image to display in the small icon at the bottom right of the large image.
	 * MUST BE THE KEY NAME OF THE IMAGE INSIDE THE RPC ASSETS!!!
	 */
	var ?smallImageKey:String;

	/**
	 * A text describing what the small icon implies.
	 */
	var ?smallImageText:String;
}