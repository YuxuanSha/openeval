import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var statusView: NSStackView!
    var statusLabel: NSTextField!
    var process: Process?
    var input: Pipe?
    var log: FileHandle?
    var buffer = Data()
    var localURL: URL?
    var terminating = false
    var restartForWorkspace = false
    var failure: String?
    var downloads = Set<WKDownload>()
    let env = ProcessInfo.processInfo.environment
    var root: URL { Bundle.main.resourceURL!.appendingPathComponent("runtime") }
    var data: URL {
        if let path = env["OPENEVAL_DESKTOP_DATA_DIR"] ?? Bundle.main.object(forInfoDictionaryKey:"OpenEvalDataDirectory") as? String ?? UserDefaults.standard.string(forKey:"OpenEvalSelectedDataDirectory"), !path.isEmpty { return URL(fileURLWithPath:path) }
        return FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("OpenEval/data")
    }
    var logURL: URL { data.appendingPathComponent("desktop-logs/window.log") }
    // Node reads cwd before loading our entry point. Persistent storage is passed
    // separately as an absolute path; it must not be the bootstrap directory.
    let launchWorkingDirectory = URL(fileURLWithPath:"/",isDirectory:true)
    func lifecycle(_ event:String,_ detail:[String:Any]=[:]) {
        var frame=detail;frame["event"]=event;frame["time"]=ISO8601DateFormatter().string(from:Date())
        if var bytes=try? JSONSerialization.data(withJSONObject:frame) {bytes.append(10);try? log?.write(contentsOf:bytes)}
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        menu()
        window = NSWindow(contentRect:NSRect(x:0,y:0,width:1260,height:860),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title=Bundle.main.object(forInfoDictionaryKey:"CFBundleDisplayName") as? String ?? "OpenEval";window.minSize=NSSize(width:800,height:600);window.delegate=self;window.center();window.setFrameAutosaveName("OpenEvalMain")
        let configuration=WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically=false
        web=WKWebView(frame:.zero,configuration:configuration);web.navigationDelegate=self;web.uiDelegate=self
        let content=NSView();window.contentView=content
        web.translatesAutoresizingMaskIntoConstraints=false;content.addSubview(web)
        NSLayoutConstraint.activate([web.leadingAnchor.constraint(equalTo:content.leadingAnchor),web.trailingAnchor.constraint(equalTo:content.trailingAnchor),web.topAnchor.constraint(equalTo:content.topAnchor),web.bottomAnchor.constraint(equalTo:content.bottomAnchor)])
        statusLabel=NSTextField(wrappingLabelWithString:"正在打开 OpenEval…");statusLabel.alignment = .center;statusLabel.font = .systemFont(ofSize:17)
        let retry=NSButton(title:"重试连接",target:self,action:#selector(start));let logs=NSButton(title:"查看运行日志",target:self,action:#selector(showLogs))
        statusView=NSStackView(views:[statusLabel,retry,logs]);statusView.orientation = .vertical;statusView.spacing=18;statusView.translatesAutoresizingMaskIntoConstraints=false;content.addSubview(statusView)
        NSLayoutConstraint.activate([statusView.centerXAnchor.constraint(equalTo:content.centerXAnchor),statusView.centerYAnchor.constraint(equalTo:content.centerYAnchor),statusView.widthAnchor.constraint(equalToConstant:560)])
        window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true);start()
    }
    func menu(){
        let main=NSMenu();let item=NSMenuItem();main.addItem(item);let app=NSMenu();item.submenu=app
        app.addItem(withTitle:"关于 OpenEval",action:#selector(about),keyEquivalent:"").target=self
        app.addItem(.separator());app.addItem(withTitle:"退出 OpenEval",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        let editItem=NSMenuItem();main.addItem(editItem);let edit=NSMenu(title:"编辑");editItem.submenu=edit
        for (title,action,key) in [("撤销","undo:","z"),("剪切","cut:","x"),("复制","copy:","c"),("粘贴","paste:","v"),("全选","selectAll:","a")] {edit.addItem(withTitle:title,action:Selector(action),keyEquivalent:key)}
        let viewItem=NSMenuItem();main.addItem(viewItem);let view=NSMenu(title:"窗口");viewItem.submenu=view
        view.addItem(withTitle:"重新载入",action:#selector(reload),keyEquivalent:"r").target=self
        view.addItem(withTitle:"显示数据文件夹",action:#selector(showData),keyEquivalent:"").target=self
        view.addItem(withTitle:"选择已有工作区…",action:#selector(chooseWorkspace),keyEquivalent:"").target=self
        view.addItem(withTitle:"保存当前画面…",action:#selector(snapshot),keyEquivalent:"").target=self
        NSApp.mainMenu=main
    }
    @objc func about(){let alert=NSAlert();alert.messageText="OpenEval";alert.informativeText="本机评测工作台 · 0.2.0\n原生 macOS 窗口 / Codex CLI\n本地构建，未完成 Apple 公证。";alert.runModal()}
    @objc func showData(){NSWorkspace.shared.open(data)}
    @objc func showLogs(){NSWorkspace.shared.activateFileViewerSelecting([logURL])}
    func readableWorkspace(_ selected:URL)->Bool {
        guard let node=executable() else{return false}
        let check=Process();check.executableURL=URL(fileURLWithPath:node);check.arguments=[root.appendingPathComponent("desktop/check-workspace.mjs").path,selected.path];check.currentDirectoryURL=launchWorkingDirectory;check.standardOutput=FileHandle.nullDevice;check.standardError=FileHandle.nullDevice
        let done=DispatchSemaphore(value:0);check.terminationHandler={_ in done.signal()}
        do{try check.run()}catch{return false}
        guard done.wait(timeout:.now()+3) == .success else{check.terminate();return false}
        return check.terminationStatus==0
    }
    @objc func chooseWorkspace(){
        if env["OPENEVAL_DESKTOP_DATA_DIR"] != nil || Bundle.main.object(forInfoDictionaryKey:"OpenEvalDataDirectory") != nil {
            let alert=NSAlert();alert.messageText="当前启动方式已指定工作区";alert.informativeText="请移除启动时的目录覆盖，或使用新版通用应用选择工作区。当前数据不会移动。";alert.beginSheetModal(for:window);return
        }
        let panel=NSOpenPanel();panel.title="选择已有 OpenEval 工作区";panel.message="选择包含 openeval.sqlite 和 blobs 文件夹的目录。不会复制或删除数据。";panel.canChooseDirectories=true;panel.canChooseFiles=false;panel.allowsMultipleSelection=false;panel.canCreateDirectories=false;panel.showsHiddenFiles=true;panel.directoryURL=data
        panel.beginSheetModal(for:window){[weak self] response in
            guard let self=self,response == .OK,let selected=panel.url?.standardizedFileURL else{return}
            var directory:ObjCBool=false
            guard FileManager.default.isReadableFile(atPath:selected.appendingPathComponent("openeval.sqlite").path),FileManager.default.fileExists(atPath:selected.appendingPathComponent("blobs").path,isDirectory:&directory),directory.boolValue,self.readableWorkspace(selected) else {
                let alert=NSAlert();alert.messageText="这不是可读取的 OpenEval 工作区";alert.informativeText="目录需要包含 openeval.sqlite 和 blobs 文件夹。原工作区保持不变。";alert.beginSheetModal(for:self.window);return
            }
            guard selected != self.data.standardizedFileURL else{return}
            let confirm=NSAlert();confirm.messageText="切换到这个工作区？";confirm.informativeText="\(selected.path)\n\n当前执行会停止，已有产物保留。切换不会合并、覆盖或重新运行任务。";confirm.addButton(withTitle:"切换工作区");confirm.addButton(withTitle:"取消")
            confirm.beginSheetModal(for:self.window){response in
                guard response == .alertFirstButtonReturn else{return}
                UserDefaults.standard.set(selected.path,forKey:"OpenEvalSelectedDataDirectory")
                if self.process?.isRunning == true {self.restartForWorkspace=true;self.show("正在停止当前执行并切换工作区…");try? self.input?.fileHandleForWriting.close();self.process?.terminate()}
                else{try? self.log?.close();self.log=nil;self.start()}
            }
        }
    }
    @objc func reload(){if localURL != nil {web.reload()}else{start()}}
    func show(_ text:String){statusLabel.stringValue=text;statusView.isHidden=false;web.isHidden=true}
    func executable()->String?{
        let candidates:[String?]=[env["OPENEVAL_NODE"],Bundle.main.bundleURL.appendingPathComponent("Contents/Frameworks/node").path,"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node","/opt/homebrew/bin/node","/usr/local/bin/node",NSHomeDirectory()+"/.local/bin/node"]
        return candidates.compactMap{$0}.first{ path in
            guard FileManager.default.isExecutableFile(atPath:path) else{return false}
            let probe=Process();let pipe=Pipe();probe.executableURL=URL(fileURLWithPath:path);probe.arguments=["--version"];probe.currentDirectoryURL=launchWorkingDirectory;probe.standardOutput=pipe;probe.standardError=FileHandle.nullDevice
            let done=DispatchSemaphore(value:0);probe.terminationHandler={_ in done.signal()}
            do{try probe.run()}catch{return false}
            guard done.wait(timeout:.now()+2) == .success else{probe.terminate();return false}
            let version=String(data:pipe.fileHandleForReading.readDataToEndOfFile(),encoding:.utf8) ?? ""
            return probe.terminationStatus==0 && (Int(version.trimmingCharacters(in:.whitespacesAndNewlines).dropFirst().split(separator:".").first ?? "0") ?? 0)>=24
        }
    }
    @objc func start(){
        if process?.isRunning == true {if let url=localURL {web.load(URLRequest(url:url))};return}
        failure=nil;localURL=nil;show("正在启动本机工作台…")
        guard let node=executable() else {show("没有找到 Node.js 24+。请安装官方 Node，或使用本机已安装 ChatGPT 的运行环境。");return}
        do{
            try FileManager.default.createDirectory(at:logURL.deletingLastPathComponent(),withIntermediateDirectories:true)
            if !FileManager.default.fileExists(atPath:logURL.path){FileManager.default.createFile(atPath:logURL.path,contents:nil)}
            log=try FileHandle(forWritingTo:logURL);try log?.seekToEnd()
            let child=Process();child.executableURL=URL(fileURLWithPath:node);child.arguments=["--experimental-strip-types",root.appendingPathComponent("desktop/server.mjs").path];child.currentDirectoryURL=launchWorkingDirectory
            var vars=env;vars["OPENEVAL_DATA_DIR"]=data.path;vars["OPENEVAL_PORT"]=env["OPENEVAL_DESKTOP_PORT"] ?? Bundle.main.object(forInfoDictionaryKey:"OpenEvalPort") as? String ?? "4318";vars["OPENEVAL_PRIVATE_EXAMPLES"]="0"
            vars["PATH"]=[Bundle.main.bundleURL.appendingPathComponent("Contents/Frameworks").path,"/opt/homebrew/bin","/usr/local/bin",NSHomeDirectory()+"/.local/bin",vars["PATH"] ?? "/usr/bin:/bin"].joined(separator:":");child.environment=vars
            let output=Pipe();let error=Pipe();input=Pipe();child.standardInput=input;child.standardOutput=output;child.standardError=error;buffer=Data()
            output.fileHandleForReading.readabilityHandler={ [weak self] handle in let bytes=handle.availableData;guard !bytes.isEmpty else {return};DispatchQueue.main.async{self?.receive(bytes)}}
            error.fileHandleForReading.readabilityHandler={ [weak self] handle in let bytes=handle.availableData;guard !bytes.isEmpty else {return};DispatchQueue.main.async{try? self?.log?.write(contentsOf:bytes)}}
            child.terminationHandler={ [weak self] p in DispatchQueue.main.async{guard let self=self else{return};output.fileHandleForReading.readabilityHandler=nil;error.fileHandleForReading.readabilityHandler=nil;self.input=nil;self.process=nil;self.localURL=nil;if self.terminating {NSApp.reply(toApplicationShouldTerminate:true)} else if self.restartForWorkspace {self.restartForWorkspace=false;try? self.log?.close();self.log=nil;self.start()} else {self.show(self.failure ?? "本地服务已结束（状态 \(p.terminationStatus)）。数据保留，可以重试；详情见运行日志。")}}}
            lifecycle("native-start",["cwd":launchWorkingDirectory.path,"dataDirectory":data.path,"entry":child.arguments!.last!])
            process=child;try child.run();lifecycle("native-child-started",["pid":child.processIdentifier])
            DispatchQueue.main.asyncAfter(deadline:.now()+20){[weak self,weak child] in guard let self=self,self.process===child,self.localURL==nil,child?.isRunning==true else{return};self.lifecycle("native-startup-timeout",["pid":child!.processIdentifier]);self.failure="本地服务启动超时，请查看日志后重试。";child?.terminate()}
        }catch{process=nil;show("无法启动：\(error.localizedDescription)")}
    }
    func receive(_ bytes:Data){
        try? log?.write(contentsOf:bytes);buffer.append(bytes)
        while let newline=buffer.firstIndex(of:10){let line=buffer.prefix(upTo:newline);buffer.removeSubrange(...newline)
            guard let frame=(try? JSONSerialization.jsonObject(with:line)) as? [String:Any] else{continue}
            if frame["event"] as? String == "error" {failure=frame["message"] as? String;show(failure ?? "启动失败")}
            if frame["event"] as? String == "ready",let address=frame["url"] as? String,let url=URL(string:address),url.host=="127.0.0.1",url.scheme=="http" {localURL=url;web.isHidden=false;statusView.isHidden=true;web.load(URLRequest(url:url))}
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool {true}
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool {window.makeKeyAndOrderFront(nil);return true}
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply {
        guard process?.isRunning==true else{return .terminateNow};terminating=true;show("正在停止执行并保存工作…");try? input?.fileHandleForWriting.close();process?.terminate();return .terminateLater
    }
    func sameOrigin(_ url:URL)->Bool{url.scheme==localURL?.scheme && url.host=="127.0.0.1" && url.port==localURL?.port}
    func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
        guard let url=action.request.url else{decisionHandler(.cancel);return}
        if action.shouldPerformDownload && (sameOrigin(url)||url.scheme=="blob"){decisionHandler(.download);return}
        if sameOrigin(url) || (action.targetFrame?.isMainFrame==false && ["about","blob"].contains(url.scheme ?? "")){decisionHandler(.allow);return}
        if action.navigationType == .linkActivated && ["https","http"].contains(url.scheme ?? ""){NSWorkspace.shared.open(url)}
        decisionHandler(.cancel)
    }
    func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){if let url=webView.url,sameOrigin(url){statusView.isHidden=true;web.isHidden=false}}
    func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error){if (error as NSError).code != NSURLErrorCancelled {show("页面连接失败：\(error.localizedDescription)。可以重新载入或查看日志。")}}
    func webView(_ webView:WKWebView,runOpenPanelWith parameters:WKOpenPanelParameters,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping([URL]?)->Void){
        guard frame.isMainFrame,let url=frame.request.url,sameOrigin(url) else{completionHandler(nil);return}
        let panel=NSOpenPanel();panel.allowsMultipleSelection=parameters.allowsMultipleSelection;panel.canChooseDirectories=false;panel.beginSheetModal(for:window){result in completionHandler(result == .OK ? panel.urls:nil)}
    }
    func webView(_ webView:WKWebView,navigationAction:WKNavigationAction,didBecome download:WKDownload){downloads.insert(download);download.delegate=self}
    func download(_ download:WKDownload,decideDestinationUsing response:URLResponse,suggestedFilename:String,completionHandler:@escaping(URL?)->Void){let panel=NSSavePanel();panel.nameFieldStringValue=(suggestedFilename as NSString).lastPathComponent;panel.beginSheetModal(for:window){result in completionHandler(result == .OK ? panel.url:nil)}}
    func downloadDidFinish(_ download:WKDownload){downloads.remove(download)}
    func download(_ download:WKDownload,didFailWithError error:Error,resumeData:Data?){downloads.remove(download);if (error as NSError).code != NSURLErrorCancelled {let alert=NSAlert();alert.messageText="下载未完成";alert.informativeText=error.localizedDescription;alert.beginSheetModal(for:window)}}
    @objc func snapshot(){web.takeSnapshot(with:nil){[weak self] image,error in guard let self=self,let image=image,let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]) else{if let self=self {let alert=NSAlert();alert.messageText="无法保存画面";alert.informativeText=error?.localizedDescription ?? "页面尚未准备好，请稍后重试。";alert.beginSheetModal(for:self.window)};return};let panel=NSSavePanel();panel.nameFieldStringValue="OpenEval-window.png";panel.beginSheetModal(for:self.window){result in if result == .OK,let url=panel.url {do{try png.write(to:url)}catch{self.show("截图保存失败：\(error.localizedDescription)")}}}}}
}
let app=NSApplication.shared
let delegate=AppDelegate()
app.delegate=delegate
app.run()
