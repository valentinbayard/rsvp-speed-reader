package com.valentinbayard.rsvp

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast

/**
 * "Lecture rapide" in the text selection menu of any app.
 *
 * A passage of a few words or more is read on its own. A shorter selection
 * (a word picked in an article) means "read from here": the screen is read
 * through the accessibility service and the reader starts at that word.
 *
 * Has no window of its own (translucent), so the app with the selection stays
 * visible and readable while the screen is captured.
 */
class SelectionActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()?.trim().orEmpty()
        val service = ScreenCaptureService.instance
        when {
            text.isEmpty() -> {}
            TextAssembler.words(text) < START_MAX_WORDS && service != null -> service.capture(fromTile = false, start = text)
            TextAssembler.words(text) < START_MAX_WORDS -> {
                Toast.makeText(this, R.string.enable_service_for_selection, Toast.LENGTH_LONG).show()
                startActivity(Intent(this, MainActivity::class.java))
            }
            else -> startActivity(
                Intent(this, MainActivity::class.java)
                    .setAction(Intent.ACTION_PROCESS_TEXT)
                    .setType("text/plain")
                    .putExtra(Intent.EXTRA_PROCESS_TEXT, text),
            )
        }
        finish()
    }

    companion object {
        /** Selections shorter than this mark where to start; longer ones are read alone. */
        const val START_MAX_WORDS = 3
    }
}
