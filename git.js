define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "scm", "proc", "c9"
    ];
    main.provides = ["scm.git"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var scm = imports.scm;
        var proc = imports.proc;
        var c9 = imports.c9;
        
        var basename = require("path").basename;
        var dirname = require("path").dirname;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit = plugin.getEmitter();
        
        var workspaceDir = c9.workspaceDir;
        
        /***** Methods *****/
        
        /**
         * Detect whether the path has a git repository 
         */
        function detect(path, callback){
            
        }
        
        function addAll(callback){
            git("add -u", callback);
        }
        
        function addFileToStaging(paths, callback){
            git(["add", "-f", "--ignore-errors", "--"].concat(paths), callback);
        }
        
        function unstageAll(callback){
            git("reset --mixed", callback);
        }
        
        function unstage(paths, callback){
            git(["reset", "--mixed", "--"].concat(paths), callback);
        }
        
        function fetch(callback){
            git("fetch", callback);
        }
        
        function pull(callback){
            git("pull", callback);
        }
        
        function push(callback){
            git("push", callback);
        }
        
        function git(args, cb) {
            if (typeof args == "string")
                args = args.split(/\s+/);
                
            proc.spawn("git", {
                args: args,
                cwd: workspaceDir
            }, function(e, p) {
                // if (e) console.error(e);
                
                buffer(p, function(stdout, stderr){
                    console.log(e, stdout);
                    
                    cb && cb(e, stdout, stderr);
                });
            });
        }
        
        function buffer(process, callback){
            var stdout = "", stderr = "";
            process.stdout.on("data", function(c){
                stdout += c;
            });
            process.stderr.on("data", function(c){
                stdout += c;
            });
            process.on("exit", function(c){
                callback(stdout, stderr);
            });
        }
        
        function getStatus(options, cb) {
            var t = Date.now();
            var args = [];
            var hash = options.hash;
            var base = options.base;
            if (hash || base) {
                args.push("diff", "--name-status", "-b", "-z", 
                    "--no-textconv", "--no-ext-diff", "--no-color",
                    "--find-renames"
                );
                if (hash == "staging")
                    hash = "--cached";
                if (base == "staging")
                    base = "--cached";
                if (hash === 0 || base === 0) {
                    args.push(base || hash);
                } else {
                    args.push(base || hash + "^1", hash);
                }
            } else {
                args.push("status", "--porcelain", "-b", "-z");
                // if (!ignored.isOpen)
                    args.push("--untracked-files=no");
                if (options.untracked == "all")
                    args.push("--untracked-files=all");
                if (options.ignored)
                    args.push("--ignored");
            }
            
            args.push("--");
            
            if (options.path)
                args.push(options.path);
            
            proc.execFile("git", {
                args: args,
                cwd: workspaceDir
            }, function(err, stdout, stderr) {
                if (err)  {
                    if (/fatal: bad revision/.test(err.message)) {
                        var EMPTY = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
                        if (options.base != EMPTY) {
                            options.base = EMPTY;
                            return getStatus(options, cb);
                        }
                    }
                    console.error(err);
                }
                console.log(err, stdout);
                console.log(t-Date.now(), stdout.length);
                cb(err, stdout);
            });
        }
        
        function getLog(options, cb) {
            var t = Date.now();
            
            git(["rev-list", "HEAD", "--count"], function(err, stdout, stderr) {
                if (err) return cb(err);
                
                console.log(err, stdout);
                console.log(t-Date.now(), stdout.length);
                
                var args = ["log", "--topo-order", "--date=raw"];
                if (options.boundary !== false) args.push("--boundary");
                if (options.logOptions) args.push.apply(args, options.logOptions);
                args.push('--pretty=format:' + (options.format || "%h %p %d %B ").replace(/ /g, "%x00"));
                args.push("--all");
                args.push("HEAD");
                args.push("-n", options.count || 1000);
                if (options.from)
                    args.push("--skip=" + options.from);
                    
                args.push("--");
                if (options.path)
                    args.push(options.path);
                
                git(args, function(err, stdout, stderr) {
                    if (err) return cb(err);
                    
                    var x = stdout.trim().split("\x00\n");
                    var root = [];
                    for (var i = 0; i < x.length; i++) {
                        var line = x[i].split("\x00");
                        root.push({
                            hash: line[0],
                            parents: line[1],
                            branches: line[2],
                            message: line[3],
                            label: line[3].substring(0, line[3].indexOf("\n") + 1 || undefined)
                        });
                    }
                    console.log(err, x);
                    console.log(t-Date.now(), stdout.length);
                    root.unshift({
                        label: "// WIP",
                        hash: 0
                    });
                    
                    cb(null, root);
                });
                
            });
        }
        
        function getFileAtHash(hash, path, cb) {
            if (!hash) {
                if (path[0] != "/")
                    path = "/" + path;
                return proc.readfile(path, {}, cb);
            }
            if (hash == "staging")
                hash = "";
            if (path[0] == "/")
                path = path.substr(1);
            proc.execFile("git", {
                args: ["show", hash + ":" + path],
                maxBuffer: 1000 * 1024,
                cwd: workspaceDir
            }, function(err, stdout, stderr) {
                cb(err, stdout, stderr);
            });
        }
        
        function loadDiff(options, callback) {
            var req = {};
            var args = ["diff",  "-U20000", options.oldPath, options.newPath];
            proc.execFile("git", {
                args: args,
                cwd: workspaceDir
            }, function(err, stdout, stderr) {
                if (err) return callback(err);
                if (!stdout) {
                    proc.execFile("git", {
                        args: ["show", options.oldPath],
                        maxBuffer: 1000 * 1024,
                        cwd: workspaceDir
                    }, function(err, stdout, stderr) {
                        if (err) return callback(err);
                        callback(err, {
                            request: req,
                            orig: stdout,
                            edit: stdout
                        });
                    });
                    return;
                }
                callback(null, {
                    request: req,
                    patch: stdout
                });
            });
            return req;
        }
        
        function addLinesToStaging(patch, cb) {
            proc.spawn("git", {
                args: ["apply", "--cached", "--unidiff-zero", "--whitespace=nowarn", "-"], // "--recount",
                cwd: workspaceDir
            }, function(err, p) {
                if (err) return cb(err);
                
                process = p.process;
                var stderr = "";
                var stdout = "";
                process.stdout.on("data", function(e) {
                    stdout += e;
                });
                process.stderr.on("data", function(e) {
                    stderr += e;
                });
                process.on("exit", function(e) {
                    cb(e, stdout, stderr);
                });
                process.stdin.write(patch);
                process.stdin.end();
            });
        }
        
        // TODO reload
        function updateCommitStatus(ammend, callback) {
            var args = ["commit", "--dry-run", "--porcelain", "--branch", "-z"];
            if (ammend)
                args.push("--amend");
                
            git(args, callback);
        }
        
        function commit(options, callback) {
            if (!options.message) return;
            var args = ["commit", options.ammend && "--amend", "-m", options.message].filter(Boolean);
            
            git(args, callback);
        }
        
        function listAllRefs(cb) {
            var args = ["for-each-ref", "--count=3000", "--sort=*objecttype", "--sort=-committerdate"];
            args.push(
                '--format=%(objectname:short) %(refname) %(upstream:trackshort) %(objecttype) %(subject) %(authorname) %(authoremail) %(committerdate:raw)'.replace(/ /g, "%00")
            );
            git(args, function(err, stdout) {
                if (err) return cb(err);
                
                var data = stdout.trim().split("\n").map(function(x) {
                    var parts = x.split("\x00");
                    return {
                        hash: parts[0],
                        name: parts[1],
                        upstream: parts[2],
                        type: parts[3],
                        subject: parts[4],
                        authorname: parts[5],
                        authoremail: parts[6],
                        committerdate: parts[7],
                    };
                });
                cb && cb(null, data);
            });
        }
        
        function getBlame(path, callback){
            proc.spawn("git", {
                args: ["blame", "-wp", "--", basename(path)],
                cwd: c9.workspaceDir + "/" + dirname(path)
            }, function(err, result) {
                if (err) return callback(err);
                buffer(process, callback);
            });
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function() {
            scm.register("git", plugin);
        });
        plugin.on("unload", function() {
            scm.unregister("git", plugin);
        });
        
        /***** Register and define API *****/
        
        /**
         */
        plugin.freezePublicAPI({
            /**
             * 
             */
            detect: detect,
            
            /**
             * 
             */
            addAll: addAll,
            
            /**
             * 
             */
            addFileToStaging: addFileToStaging,
            
            /**
             * 
             */
            unstageAll: unstageAll,
            
            /**
             * 
             */
            unstage: unstage,
            
            /**
             * 
             */
            fetch: fetch,
            
            /**
             * 
             */
            pull: pull,
            
            /**
             * 
             */
            git: git,
            
            /**
             * 
             */
            push: push,
            
            /**
             * 
             */
            buffer: buffer,
            
            /**
             * 
             */
            getStatus: getStatus,
            
            /**
             * 
             */
            getLog: getLog,
            
            /**
             * 
             */
            getFileAtHash: getFileAtHash,
            
            /**
             * 
             */
            loadDiff: loadDiff,
            
            /**
             * 
             */
            addLinesToStaging: addLinesToStaging,
            
            /**
             * 
             */
            updateCommitStatus: updateCommitStatus,
            
            /**
             * 
             */
            commit: commit,
            
            /**
             * 
             */
            listAllRefs: listAllRefs,
            
            /**
             * 
             */
            getBlame: getBlame,
            
        });
        
        register(null, {
            "scm.git": plugin
        });
    }
});