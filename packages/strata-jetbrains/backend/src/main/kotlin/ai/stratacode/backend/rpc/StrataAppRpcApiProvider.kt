@file:Suppress("UnstableApiUsage")

package ai.stratacode.backend.rpc

import ai.stratacode.rpc.StrataAppRpcApi
import com.intellij.platform.rpc.backend.RemoteApiProvider
import fleet.rpc.remoteApiDescriptor

internal class StrataAppRpcApiProvider : RemoteApiProvider {
    override fun RemoteApiProvider.Sink.remoteApis() {
        remoteApi(remoteApiDescriptor<StrataAppRpcApi>()) {
            StrataAppRpcApiImpl()
        }
    }
}
