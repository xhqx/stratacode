@file:Suppress("UnstableApiUsage")

package ai.stratacode.backend.rpc

import ai.stratacode.rpc.StrataWorkspaceRpcApi
import com.intellij.platform.rpc.backend.RemoteApiProvider
import fleet.rpc.remoteApiDescriptor

internal class StrataProjectRpcApiProvider : RemoteApiProvider {
    override fun RemoteApiProvider.Sink.remoteApis() {
        remoteApi(remoteApiDescriptor<StrataWorkspaceRpcApi>()) {
            StrataWorkspaceRpcApiImpl()
        }
    }
}
