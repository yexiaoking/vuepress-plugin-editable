import "./style.css";
import bus from "./eventBus";

import {
	githubOAuthUrl,
	updatePRAPI,
	getContentAPI,
	fetchOps,
} from "./config";

export default {
	data() {
		return {
			preLine: null,
			preNode: null,
			preNodeContent: null, // current old content
			isPlainTextStatus: false,
		};
	},
	mounted() {
		const targetNode = document.querySelector("body");
		let isEditable = null;
		const dblClick = (event) => {
			const currentLine = event.target.getAttribute("data-editable-line");
			if (currentLine || currentLine != null) {
				isEditable = event.target.getAttribute("contenteditable");
				
				let oAuth = "Github OAuth";
				event.target.classList.add("focus-editable");
				
				if (!this.isOAuthStatus()) {
					this.createMenu(event, {oAuth});
					if (!this.isPlainText(event.target)) {
						event.target.classList.add("no-edit");
					}
				} else {
					if (this.isPlainText(event.target)) {
						//  plain text
						this.createMenu(event, {
							apply: "应用",
							restore: "还原",
						});
						this.listenerInput(event);
						//
						event.target.setAttribute("contenteditable", true);
					} else {
						//  complex text
						this.createMenu(event, {
							update: "修改",
							restore: "还原",
						});
						event.target.classList.add("no-edit");
					}
				}
				
				this.preLine = currentLine;
				this.preNode = event.target;
				// temp handler 实际上这种处理方式欠妥
				this.preNodeContent = event.target.innerHTML.replace(
					/<strong(.+?)strong>/g,
					""
				);
			}
		};
		
		if (targetNode) {
			targetNode.removeEventListener("dblclick", dblClick);
			targetNode.addEventListener("dblclick", dblClick);
			targetNode.removeEventListener("click", this.outsideClick);
			targetNode.addEventListener("click", this.outsideClick);
		}
		this.saveAccessToken();
	},
	methods: {
		saveAccessToken() {
			const accessToken = this.$route.query.accessToken;
			if (this.$route.query.accessToken) {
				sessionStorage.githubOAuthAccessToken = accessToken;
			}
		},
		/**
		 * click outside
		 */
		outsideClick(event) {
			const clickLine = event.target.getAttribute("data-editable-line");
			if (
				this.preLine &&
				clickLine !== this.preLine &&
				!event.target.classList.contains("no-need-close")
			) {
				this.preNode.removeAttribute("contenteditable");
				this.preNode.classList.remove("focus-editable");
				this.preNode.classList.remove("no-edit");
				this.removeMenu();
			}
			this.bindMenuEvent(event);
		},
		/**
		 * apply menu
		 * restore menu
		 * @param event
		 * @param btnWords { Object}
		 * {apply: "应用",
        restore: "还原", // redirect update
        update: "修改" // call console ui
        }
		 */
		createMenu(event, btnWords) {
			this.removeMenu();
			
			const parenNode = document.createElement("strong");
			parenNode.classList.add("editable-menu");
			parenNode.classList.add("no-need-close");
			parenNode.setAttribute("contenteditable", false);
			const vNode = document.createDocumentFragment();
			
			for (let key in btnWords) {
				let childNode = null;
				if (key !== "oAuth") {
					childNode = document.createElement("span");
				} else {
					childNode = document.createElement("a");
					childNode.href = githubOAuthUrl + "?reference=" + location.href;
				}
				childNode.innerHTML = btnWords[key];
				childNode.setAttribute("contenteditable", false);
				childNode.classList.add("no-need-close");
				childNode.classList.add("editable-" + key);
				vNode.appendChild(childNode);
			}
			parenNode.appendChild(vNode);
			event.target.appendChild(parenNode);
		},
		/**
		 * remove menu
		 */
		removeMenu() {
			const editMenu = document.querySelector(".editable-menu");
			editMenu && editMenu.remove();
		},
		
		bindMenuEvent(event) {
			if (
				event.target.classList.contains("editable-apply") ||
				event.target.classList.contains("editable-update")
			) {
				this.updatePR(event);
			}
			if (event.target.classList.contains("editable-restore")) {
				this.reloadPage(event);
			}
		},
		/**
		 * @param sourcePath {string}
		 * @param line {number}
		 * @param content {string}
		 * */
		updatePR(event) {
			const repoPrefix = this.$themeConfig.repo || "";
			if (!repoPrefix || !repoPrefix.length) {
				console.warn("Warning: You have not set the repo url");
			}
			const node = document.querySelector(".focus-editable");
			const menuNode = document.querySelector(".editable-menu");
			node.removeChild(menuNode);
			const content = node.innerHTML;
			const line = node.getAttribute("data-editable-line");
			const {owner, repo} = this.getOwnerRepo(repoPrefix);
			if (this.isPlainTextStatus) {
				this.postSinglePR(
					owner,
					repo,
					this.$page.remoteRelativePath,
					content,
					line
				);
			} else {
				this.getOriginContent(owner, repo, this.$page.remoteRelativePath);
			}
		},
		/**
		 * handler plain text PR
		 */
		postSinglePR(owner, repo, path, content, line) {
			fetch(updatePRAPI, {
				body: JSON.stringify({
					owner,
					repo,
					path,
					content,
					line: Number(line),
				}),
				method: "POST",
				...this.fetchOps,
			})
				.then((res) => {
					return res.json();
				})
				.then((data) => {
					this.respHandler(data);
				});
		},
		/**
		 * @return {
		 * owner,
		 *  repo
		 * }
		 */
		getOwnerRepo(ownerRepo) {
			const strArr = ownerRepo.split("/");
			return {
				owner: strArr[0] ? strArr[0] : "",
				repo: strArr[1] ? strArr[1] : "",
			};
		},
		reloadPage() {
			location.reload();
		},
		
		/**
		 * is plain text
		 * @return {boolean}
		 */
		isPlainText(node) {
			if (!node.children.length) {
				this.isPlainTextStatus = true;
				return true;
			} else {
				this.isPlainTextStatus = false;
				return false;
			}
		},
		
		/**
		 * listener contenteditable input
		 * contenteditable 里的内容被清空的行为导致丢失 textElement
		 * 此举为了不丢失 contenteditbale 特性而追加的
		 */
		listenerInput(event) {
			event.target.addEventListener("input", (inputEvent) => {
				const firstTextNode = inputEvent.target.childNodes[0];
				if (firstTextNode.nodeName !== "#text") {
					const emptyTextNode = document.createTextNode(
						"Please input something..."
					);
					inputEvent.target.insertBefore(emptyTextNode, firstTextNode);
				}
			});
		},
		/**
		 * get origin source file content
		 */
		getOriginContent(owner, repo, path) {
			bus.$emit("showLoading", true);
			fetch(
				getContentAPI + "?owner=" + owner + "&repo=" + repo + "&path=" + path,
				{
					method: "GET",
					...fetchOps,
					headers: new Headers({
						"Access-Token": sessionStorage.githubOAuthAccessToken,
						"Content-Type": "Application/json",
					}),
				}
			)
				.then((res) => res.json())
				.then((data) => {
					bus.$emit("showLoading", false);
					if (data.code === 0) {
						bus.$emit("showReview", {
							status: true,
							owner,
							repo,
							path,
							content: data.data,
						});
					} else {
						bus.$emit("onReceive", data, true);
					}
				})
				.catch(() => {
					bus.$emit("showLoading", false);
				});
		},
		respHandler(data = {}) {
			if (data.code === 0) {
				bus.$emit("onReceive", data, true);
			} else {
				sessionStorage.removeItem("githubOAuthAccessToken");
				location.href = this.$route.path;
				console.warn(data);
			}
		},
		/*
		 * 判断是否授权过，即检查本地是否存储 access token
		 * @return  {boolean}
		 */
		isOAuthStatus() {
			if (!this.$route.query.accessToken) {
				return false;
			} else {
				return !!(sessionStorage.githubOAuthAccessToken &&
					sessionStorage.githubOAuthAccessToken.length === 40);
			}
		},
	},
};
