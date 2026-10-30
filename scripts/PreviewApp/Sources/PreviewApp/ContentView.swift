import SwiftUI

struct TodoItem: Identifiable, Hashable {
    let id = UUID()
    var title: String
    var done = false
}

final class TaskStore: ObservableObject {
    @Published var tasks: [TodoItem] = [
        TodoItem(title: "Build F-Code", done: true),
        TodoItem(title: "Write the SwiftUI shim"),
        TodoItem(title: "Render it in the Simulator canvas"),
    ]
    var remaining: Int { tasks.filter { !$0.done }.count }
}

struct ContentView: View {
    @StateObject private var store = TaskStore()
    @State private var newTitle = ""
    @State private var showSettings = false
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                List {
                    Section("Add") {
                        HStack {
                            TextField("New task", text: $newTitle)
                            Button("Add") {
                                guard !newTitle.isEmpty else { return }
                                store.tasks.append(TodoItem(title: newTitle))
                                newTitle = ""
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                    Section {
                        ForEach(store.tasks) { task in
                            NavigationLink {
                                TaskDetail(task: task)
                            } label: {
                                TaskRow(task: task) { toggle(task) }
                            }
                        }
                    } header: {
                        Text("\(store.remaining) remaining")
                    }
                }
                .navigationTitle("Tasks")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gearshape")
                        }
                    }
                }
                .sheet(isPresented: $showSettings) {
                    SettingsView()
                }
            }
            .tabItem { Label("Tasks", systemImage: "checklist") }
            .tag(0)

            CounterView()
                .tabItem { Label("Counter", systemImage: "number") }
                .tag(1)
        }
    }

    private func toggle(_ task: TodoItem) {
        if let i = store.tasks.firstIndex(of: task) { store.tasks[i].done.toggle() }
    }
}

struct TaskRow: View {
    let task: TodoItem
    let onToggle: () -> Void
    var body: some View {
        HStack {
            Button(action: onToggle) {
                Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(task.done ? .green : .secondary)
                    .font(.title3)
            }
            .buttonStyle(.plain)
            Text(task.title)
                .strikethrough(task.done)
                .foregroundStyle(task.done ? .secondary : .primary)
            Spacer()
        }
    }
}

struct TaskDetail: View {
    let task: TodoItem
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: task.done ? "checkmark.seal.fill" : "clock")
                .font(.system(size: 64))
                .foregroundStyle(task.done ? .green : .orange)
            Text(task.title).font(.title2).bold()
            Text(task.done ? "Completed" : "Still to do").foregroundStyle(.secondary)
            Button("Done") { dismiss() }
                .buttonStyle(.bordered)
        }
        .padding()
        .navigationTitle("Detail")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct CounterView: View {
    @State private var count = 0
    @State private var step = 1.0
    @State private var big = false

    var body: some View {
        VStack(spacing: 24) {
            Text("\(count)")
                .font(.system(size: big ? 96 : 64, weight: .bold, design: .rounded))
                .foregroundStyle(count < 0 ? .red : .blue)
            HStack(spacing: 12) {
                Button("−") { count -= Int(step) }
                Button("+") { count += Int(step) }
            }
            .buttonStyle(.borderedProminent)
            .font(.title)
            VStack(alignment: .leading) {
                Text("Step: \(Int(step))")
                Slider(value: $step, in: 1...10, step: 1)
            }
            Toggle("Large digits", isOn: $big)
            Spacer()
        }
        .padding()
    }
}

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var notifications = true
    @State private var theme = "System"
    var body: some View {
        NavigationStack {
            Form {
                Toggle("Notifications", isOn: $notifications)
                Picker("Theme", selection: $theme) {
                    Text("System").tag("System")
                    Text("Light").tag("Light")
                    Text("Dark").tag("Dark")
                }
                .pickerStyle(.segmented)
                Section("About") {
                    LabeledContent("Version", value: "0.1")
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }
}
