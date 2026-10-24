package com.valentinbayard.rsvp

/**
 * Hands a text over to the reader page. Kept in memory rather than in an
 * Intent extra because articles can exceed the binder transaction limit.
 */
object PayloadStore {
    @Volatile private var pending: String? = null

    fun put(json: String) {
        pending = json
    }

    fun take(): String? = synchronized(this) {
        val p = pending
        pending = null
        p
    }
}
