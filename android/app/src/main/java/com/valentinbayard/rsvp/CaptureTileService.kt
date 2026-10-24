package com.valentinbayard.rsvp

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast

/** Quick settings tile: another way to trigger "read this screen". */
class CaptureTileService : TileService() {

    override fun onStartListening() {
        qsTile?.apply {
            state = if (ScreenCaptureService.instance != null) Tile.STATE_INACTIVE else Tile.STATE_UNAVAILABLE
            updateTile()
        }
    }

    override fun onClick() {
        val service = ScreenCaptureService.instance
        if (service != null) {
            service.capture(fromTile = true)
            return
        }
        Toast.makeText(this, R.string.enable_service_first, Toast.LENGTH_LONG).show()
        val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(
                PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
            )
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
