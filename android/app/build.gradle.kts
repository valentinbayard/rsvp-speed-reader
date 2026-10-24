import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val buildNumber = (System.getenv("BUILD_NUMBER") ?: "1").toInt()

android {
    namespace = "com.valentinbayard.rsvp"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.valentinbayard.rsvp"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "2.0.$buildNumber"
    }

    // Sign with your own key when RSVP_KEYSTORE is set (CI: repository secrets),
    // so that new builds install over old ones. Otherwise the debug key is used.
    val keystore = System.getenv("RSVP_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }
    signingConfigs {
        if (keystore != null) {
            create("release") {
                storeFile = keystore
                storePassword = System.getenv("RSVP_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("RSVP_KEY_ALIAS")
                keyPassword = System.getenv("RSVP_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webassets"))
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

// The reader UI is the web app in /web, bundled as assets.
val copyWebAssets = tasks.register<Sync>("copyWebAssets") {
    from(rootProject.file("../web")) {
        exclude("sw.js", "manifest.webmanifest")
    }
    into(layout.buildDirectory.dir("generated/webassets/web"))
}
tasks.named("preBuild") { dependsOn(copyWebAssets) }

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")
}
