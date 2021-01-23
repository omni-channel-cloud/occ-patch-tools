// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
var fs = require("fs");
var _path = require("path");
var exec = require('child_process').exec;

var UglifyJS = require('uglify-js');
var HtmlMin = require('htmlmin');
var CssMin = require('clean-css');

var Archiver = require('archiver');

var os=require('os');
var homedir=os.homedir() + _path.sep + 'Desktop';

let selectedFiles = [];
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "the-patch-tool" is now active!');
	//注册命令
	const fc = vscode.commands.registerCommand('patch-tool.PATCHER', function (param, selectFiles) {

		selectedFiles = selectFiles;
        // 文件夹绝对路径
		const folderPath = param.fsPath;
		
        // 创建webview
        const panel = vscode.window.createWebviewPanel(
            'occPatchWebview', // viewType
            "补丁工具", // 视图标题
            vscode.ViewColumn.One, // 显示在编辑器的哪个部位
            {
                enableScripts: true, // 启用JS，默认禁用
                retainContextWhenHidden: true, // webview被隐藏时保持状态，避免被重置
            }
		);

		// 填充webview内容
		panel.webview.html = getWebviewContent(selectFiles.map((file)=>file.path));

		// 接收webview 发送的信息，生成补丁文件
		panel.webview.onDidReceiveMessage(message => {
			// 组装消息内容
			console.log('插件收到的消息：', message);
			let msg = "";
			for (const key in message) {
				// 选择文件路径不显示到说明中
				if (message.hasOwnProperty(key) && (key !== '已选文件' && key !== '是否压缩')) {
					const val = message[key];
					msg += key+":"+message[key]+"\r\n";
				}
			}

			if(!message.解决问题) {
				console.log("请描述所解决的问题");
				vscode.window.showErrorMessage('请描述所解决的问题');
				return ;
			}

			// 确定补丁文件相对路径
			if(!message.已选文件) {
				console.log("没有选择文件");
				vscode.window.showErrorMessage('没有选择文件');
				return ;
			}

			vscode.window.setStatusBarMessage('补丁正在导出中……');
			// let myPath = path.join(homedir, '/patch/', message.已选文件.substring(start, end).replace('src\\', ''));
			const isUglify = message.是否压缩;

			try{
				const patchName = generationPatch(selectedFiles, message.解决问题, msg, isUglify);

				panel.dispose();
				vscode.window.showInformationMessage('补丁已放在 ' + homedir + _path.sep + patchName, {modal:true}, "打开目录", "知道了")
				.then(select=>{
					switch (select) {
						case '打开目录':
							if(os.platform() === 'darwin') {
								exec('open -R ' + homedir + _path.sep + patchName);
							} else {
								exec('explorer.exe /select, ' + homedir + _path.sep + patchName);
							}
							break;
						default:
							break;
					}
				});
			}catch(e){
				console.log(e);
			}
		}, undefined, context.subscriptions);
    });
    
    context.subscriptions.push(fc);
}

function generationPatch(paths, title, description, isUglify) {
	if (!fs.existsSync(_path.join(homedir,'/patch/说明.txt'))) {
		fs.mkdirSync(_path.join(homedir,'/patch/'));
		fs.writeFileSync(_path.join(homedir,'/patch/说明.txt'), description)
	}
	console.log("目录创建成功。");

	paths.forEach(file=>{
		file.path = file.path.substring(1);
		const start = file.path.indexOf('occ-portal-static/src')+21;
		const end = file.path.lastIndexOf('/')+1;
		const tempDir = _path.join(homedir, '/patch/', file.path.substring(start, end));
		const filename = file.path.substring(end);
		// 生成补丁目录
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir,{recursive:true});
		}

		if(isUglify) {
			const ugFileContent = uglifyFile(file.path);
			fs.writeFileSync(tempDir + _path.sep + filename, ugFileContent);
			console.log("数据写入成功！")
		} else {
			fs.copyFileSync(file.path, tempDir + filename);
			console.log("数据写入成功！")
		}
	});

	// 打包
	const zipName = archiver(title, ()=>{
		removeTempDir(_path.join(homedir, _path.sep + 'patch'));
	});
	return zipName;
}

function uglifyFile(filepath) {
	const fileContent = fs.readFileSync(filepath, {encoding: 'utf-8'});
	let resultFileContent = '';
	const extensionName = filepath.split('.')[1];
	switch (extensionName) {
		case 'js':
			const ugResult = UglifyJS.minify(fileContent);
			if(ugResult.error){
				vscode.window.showErrorMessage(ugResult.error.message);
			} else {
				resultFileContent = ugResult.code;
			}
			break;
		case 'html':
			resultFileContent = HtmlMin(fileContent);
			break;
		case 'css':
			const minResult = new CssMin({}).minify(fileContent);
			if(minResult.errors){
				vscode.window.showErrorMessage(minResult.errors.join(','));
			} else {
				resultFileContent = minResult.styles;
			}
			break;
		default:
			break;
	}
	return resultFileContent;
}

function archiver(title, callBack) {
	// 创建文件
	const date = new Date();
	const df = date.getFullYear()+''+(date.getMonth()+1)+''+date.getDate();
	const zipName = 'patcher' + '_' + df + '_' + title + '.zip';
	var output = fs.createWriteStream(homedir + _path.sep + zipName);

	//生成archiver对象，打包类型为zip
	var archive = Archiver('zip');

	//对文件夹进行压缩
	const filePath = _path.join(homedir,'/patch/');
	archive.directory(filePath, false);
	archive.pipe(output); //将打包对象与输出流关联
	//监听所有archive数据都写完
	output.on('close', function() {
			console.log('压缩完成', archive.pointer() / 1024  + 'K');
			callBack();
	});
	archive.on('error', function(err) {
			callBack();
			vscode.window.showErrorMessage(err.message);
			throw err;
	});
	//打包
	archive.finalize();
	return zipName;
}

function removeTempDir(p){
	let statObj = fs.statSync(p); // fs.statSync同步读取文件状态，判断是文件目录还是文件。
	if(statObj.isDirectory()){ //如果是目录
		let dirs = fs.readdirSync(p) //fs.readdirSync()同步的读取目标下的文件 返回一个不包括 '.' 和 '..' 的文件名的数组['b','a']
		dirs = dirs.map(dir => _path.join(p, dir))  //拼上完整的路径
		for (let i = 0; i < dirs.length; i++) {
			// 深度 先将儿子移除掉 再删除掉自己
			removeTempDir(dirs[i]);
		}
		fs.rmdirSync(p); //删除目录
	}else{
		fs.unlinkSync(p); //删除文件
	}
};

//webview页面
function getWebviewContent(folderPath) {
	let paths = "";
	folderPath.forEach(path=>{
		const start = path.indexOf('occ-portal-static/src')+21;
		paths = paths + path.substring(start) + '\n';
	});
    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>补丁工具</title>
			</head>
			<body>
			<div id="form">
			<form id="login">
				<p>解决问题: <br/><input style="width:200px" type="text" id="problem" size="100"/></p>
				<p> 提 供 人  : <br/><input style="width:200px" type="text" id="origin" size="100" value=${os.hostname()} /></p>
				<p>补丁版本: <br/><input style="width:200px" type="text" id="version" size="100" value="v1" /></p>
				<p>已选文件: <br/><textarea cols="100" rows="10" id="rurl" readonly>${paths}</textarea></p>
				<p>是否压缩: <input type="checkbox" checked id="uglify" /></p>
				<p><input type="button" value="生成补丁" onclick="checkForm()"/></p>
			</form>
			</div>
			<script>
			
			function checkForm(){
				var problem = document.getElementById("problem").value;
				var origin = document.getElementById("origin").value;
				var version = document.getElementById("version").value;
				var rurl = document.getElementById("rurl").value;
				var uglify = document.getElementById("uglify").checked;
				//向插件发送信息
				const vscode = acquireVsCodeApi();
				vscode.postMessage({
					解决问题:problem,
					提供人:origin,
					补丁版本:version,
					已选文件:rurl,
					是否压缩:uglify,
					是否重启:'否'}
				); 
			}

			</script>
			</body>
			</html>`;
}

module.exports = {
	activate
}
