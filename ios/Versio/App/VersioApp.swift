import SwiftUI

@main
struct VersioApp: App {
    @State private var auth = SpotifyAuth.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .preferredColorScheme(.dark)
                .tint(.white)
        }
    }
}
